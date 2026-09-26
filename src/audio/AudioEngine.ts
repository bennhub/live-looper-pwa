import type { LooperStore } from "../state/store";
import type { Layer } from "../state/types";
import { Scheduler, PeriodicScheduler } from "./Scheduler";
import { Metronome } from "./Metronome";
import { LayerVoice } from "./LayerPlayer";
import { RecorderNode } from "./recorderNode";
import { TapTempo } from "./TapTempo";
import { buildAudioConstraints, buildFallbackAudioConstraints } from "./devices";
import {
  barsToFrames,
  fitToLength,
  frameAtTime,
  quantizeLoopLengthFrames,
  secondsPerBeat,
  wrapFrame,
} from "./quantize";
import { rampGain } from "./gainRamp";
import { applyLatencyCompensation } from "./latency";

function nextLayerId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function wrapSeconds(t: number, period: number): number {
  if (period <= 0) return 0;
  return ((t % period) + period) % period;
}

// Small scheduling headroom used whenever we (re)anchor loop playback to
// "right now" - gives the audio graph a moment to actually schedule the
// source before its start time arrives.
const LOOP_START_LEAD_SECONDS = 0.05;

export interface TimelineInfo {
  bar: number;
  totalBars: number;
  beat: number;
  beatsPerBar: number;
  progress: number; // 0..1 through the current loop cycle
}

/**
 * Facade that owns the Web Audio graph and orchestrates record/overdub/
 * play/stop against the store. The store stays a passive state container;
 * this class is the only thing that calls its mutation methods in response
 * to engine-driven events (a take finishing, etc).
 */
export class AudioEngine {
  readonly audioContext: AudioContext;
  private readonly scheduler: Scheduler;
  private readonly metronome: Metronome;
  private readonly masterGain: GainNode;
  private readonly monitorGain: GainNode;
  private readonly analyser: AnalyserNode;
  private recorder: RecorderNode | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private readonly layerVoices = new Map<string, LayerVoice>();
  private loopPeriodic: PeriodicScheduler | null = null;
  private beatPeriodic: PeriodicScheduler | null = null;
  private beatPeriodicEpoch: number | null = null;
  private loopEpoch: number | null = null;
  private readonly tapTempoTracker = new TapTempo();
  private readonly store: LooperStore;

  constructor(store: LooperStore) {
    this.store = store;
    // `0` explicitly asks for the lowest latency the platform can provide -
    // per spec this is distinct from the `'interactive'` preset (which maps
    // to a fixed internal target), and can resolve to a smaller output
    // buffer than that preset on some browser/OS audio backends. Worst case
    // it just clamps to the same floor 'interactive' would have anyway.
    this.audioContext = new AudioContext({ latencyHint: 0 });
    this.scheduler = new Scheduler(this.audioContext);
    this.scheduler.start();

    this.metronome = new Metronome(this.audioContext);
    this.metronome.setVolume(store.getState().settings.metronomeVolume);

    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);

    this.monitorGain = this.audioContext.createGain();
    this.monitorGain.connect(this.audioContext.destination);
    this.applyMonitorSettings();

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
  }

  // ---------------------------------------------------------------- setup

  /** Must be called (and awaited) from within a user-gesture handler. */
  async ensureResumed(): Promise<void> {
    if (this.audioContext.state !== "running") {
      await this.audioContext.resume();
    }
  }

  /** (Re)acquires the mic and (re)wires the monitor/analyser/recorder graph. */
  async connectInput(deviceId: string | null): Promise<void> {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.sourceNode?.disconnect();
    this.recorder?.dispose();

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));
    } catch (err) {
      // Some browsers/OS versions (iOS Safari has had documented issues
      // here) can reject the request outright over the advanced
      // echoCancellation/noiseSuppression/autoGainControl hints, even
      // though none of them are exact constraints. Retry with the minimal,
      // maximally-compatible set before giving up and surfacing an error.
      console.warn("[AudioEngine] getUserMedia failed with preferred constraints, retrying with defaults", err);
      this.micStream = await navigator.mediaDevices.getUserMedia(buildFallbackAudioConstraints(deviceId));
    }
    this.sourceNode = this.audioContext.createMediaStreamSource(this.micStream);
    this.sourceNode.connect(this.analyser);
    this.sourceNode.connect(this.monitorGain);

    this.recorder = new RecorderNode(this.audioContext);
    await this.recorder.init(this.sourceNode);
  }

  async setInputDevice(deviceId: string | null): Promise<void> {
    this.store.updateSettings({ inputDeviceId: deviceId });
    await this.connectInput(deviceId);
  }

  /** Connects the mic on first use (e.g. the first Record/Play press) rather than at page load. */
  private async ensureInputConnected(): Promise<void> {
    if (this.recorder) return;
    await this.connectInput(this.store.getState().settings.inputDeviceId);
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  // ------------------------------------------------------------ monitoring

  setMonitorEnabled(enabled: boolean): void {
    this.store.updateSettings({ monitorEnabled: enabled });
    this.applyMonitorSettings();
  }

  setMonitorVolume(volume: number): void {
    this.store.updateSettings({ monitorVolume: volume });
    this.applyMonitorSettings();
  }

  private applyMonitorSettings(): void {
    const { monitorEnabled, monitorVolume } = this.store.getState().settings;
    rampGain(this.monitorGain.gain, monitorEnabled ? monitorVolume : 0, this.audioContext);
  }

  // ------------------------------------------------------------ metronome

  setMetronomeVolume(volume: number): void {
    this.store.updateSettings({ metronomeVolume: volume });
    this.metronome.setVolume(volume);
  }

  toggleMetronomeEnabled(): void {
    const enabled = !this.store.getState().settings.metronomeEnabled;
    this.store.updateSettings({ metronomeEnabled: enabled });
  }

  /** Records a tap and, once enough taps exist, updates BPM going forward. */
  tapTempo(): void {
    const bpm = this.tapTempoTracker.recordTap(performance.now());
    if (bpm === null) return;
    this.store.updateSettings({ bpm });
    // Note: changing BPM after a loop exists never resizes committed layers -
    // it only changes metronome click speed going forward, matching real
    // looper-pedal behavior (documented limitation, not a bug).
    this.beatPeriodic?.setPeriod(secondsPerBeat(bpm));
  }

  // ------------------------------------------------------------- transport

  /** idle -> (count-in ->) recording -> playing. */
  async record(): Promise<void> {
    if (this.store.getState().transport !== "idle") return;
    await this.ensureResumed();
    await this.ensureInputConnected();
    const state = this.store.getState();

    const { bpm, timeSignature, countInEnabled, countInBars, loopMode, bars } = state.settings;
    const beatsPerBar = timeSignature.beatsPerBar;
    const secPerBeat = secondsPerBeat(bpm);
    const sampleRate = this.audioContext.sampleRate;
    const leadIn = 0.05;
    const epoch = this.audioContext.currentTime + leadIn;

    let recordStartTime = epoch;
    if (countInEnabled) {
      this.store.setTransport("count-in");
      const totalBeats = beatsPerBar * countInBars;
      for (let i = 0; i < totalBeats; i++) {
        const t = epoch + i * secPerBeat;
        const isDownbeat = i % beatsPerBar === 0;
        // Count-in click is unconditional - it's the cueing sound for count-in
        // itself, independent of the main Metronome toggle (which instead
        // governs whether a click plays during the recording/overdub pass).
        // `t` itself (used below for recordStartTime) stays on the true grid -
        // only the audible click is nudged for monitor-sync, matching onBeatTick.
        this.scheduler.scheduleAt(t, (time) => this.metronome.playClick(time + this.monitorSyncSeconds, isDownbeat));
      }
      recordStartTime = epoch + totalBeats * secPerBeat;
    }

    // Metronome clicks must keep going through the recording itself, not
    // just count-in - start the beat scheduler now, anchored at
    // recordStartTime (the same epoch loop playback will use once the take
    // commits), so there's no gap between count-in ending and the recording
    // pass starting. onBeatTick() gates the actual click on metronomeEnabled
    // and on being in an active capture state, live, on every tick.
    this.ensureBeatPeriodic(recordStartTime, bpm);

    let stopFrame: number | null = null;
    if (loopMode === "fixed-bar") {
      const frames = barsToFrames(bpm, beatsPerBar, bars, sampleRate);
      stopFrame = frameAtTime(sampleRate, recordStartTime) + frames;
    }

    const startFrame = frameAtTime(sampleRate, recordStartTime);
    const capturePromise = this.recorder!.arm(startFrame, stopFrame);
    this.scheduler.scheduleAt(recordStartTime, () => this.store.setTransport("recording"));

    const { samples } = await capturePromise;
    this.commitBaseLayer(samples);
  }

  /** Manual stop for Free Loop Mode recording (Fixed Bar Mode auto-stops). */
  stopRecording(): void {
    const state = this.store.getState();
    if (state.transport !== "recording" || state.settings.loopMode !== "free" || !this.recorder) return;
    const stopFrame = frameAtTime(this.audioContext.sampleRate, this.audioContext.currentTime);
    this.recorder.stopAt(stopFrame);
  }

  /** Cancels an in-progress count-in or base recording, back to idle. Escape key. */
  cancelRecording(): void {
    const state = this.store.getState();
    if (state.transport !== "count-in" && state.transport !== "recording") return;
    this.scheduler.clear(); // safe: no loop-restart cycles exist yet at this point
    // The beat-click scheduler is running by now (started in record() so
    // clicks continue through recording) - .clear() only drops already-queued
    // one-off events, not its onTick refill hook, so it must be stopped
    // explicitly or it would keep clicking forever after a cancelled take.
    this.beatPeriodic?.stop();
    this.beatPeriodicEpoch = null;
    this.recorder?.cancel();
    this.store.setTransport("idle");
  }

  private commitBaseLayer(rawSamples: Float32Array<ArrayBuffer>): void {
    const state = this.store.getState();
    const sampleRate = this.audioContext.sampleRate;
    const { loopMode, quantize, bpm, timeSignature, bars, latencyCompensationMs } = state.settings;

    let masterFrames: number;
    if (loopMode === "fixed-bar") {
      masterFrames = barsToFrames(bpm, timeSignature.beatsPerBar, bars, sampleRate);
    } else if (quantize) {
      masterFrames = quantizeLoopLengthFrames(rawSamples.length, bpm, sampleRate);
    } else {
      masterFrames = rawSamples.length;
    }

    const fitted = fitToLength(rawSamples, masterFrames);
    const aligned = applyLatencyCompensation(fitted, 0, latencyCompensationMs, sampleRate);

    const buffer = this.audioContext.createBuffer(1, masterFrames, sampleRate);
    buffer.copyToChannel(aligned, 0);

    const layer: Layer = {
      id: nextLayerId(),
      order: 0,
      buffer,
      gain: 1,
      muted: false,
      isBase: true,
      createdAt: Date.now(),
    };

    this.store.setMasterLoopFrames(masterFrames);
    this.store.addLayer(layer);
    this.createVoiceForLayer(layer);

    // Anchor playback to "right now", not to the original recordStartTime +
    // masterFrames. Those only coincide when masterFrames exactly equals the
    // real elapsed capture time - true for Fixed Bar mode and unquantized
    // Free mode, but NOT for quantized Free mode, where the loop length is
    // deliberately rounded to the nearest beat and can end up shorter than
    // how long was actually recorded. In that case the old "epoch stays in
    // the past" approach made the scheduler think a full extra cycle had
    // already elapsed, delaying first playback by a whole loop length.
    this.loopEpoch = this.audioContext.currentTime + LOOP_START_LEAD_SECONDS;
    this.store.setTransport("playing");
    this.startLoopPlayback();
  }

  private startLoopPlayback(): void {
    const state = this.store.getState();
    if (this.loopEpoch === null || state.masterLoopFrames === null) return;
    const periodSeconds = state.masterLoopFrames / this.audioContext.sampleRate;

    this.loopPeriodic?.stop();
    this.loopPeriodic = new PeriodicScheduler(this.scheduler, this.loopEpoch, periodSeconds, (time) =>
      this.onLoopCycle(time),
    );
    this.loopPeriodic.start();

    this.ensureBeatPeriodic(this.loopEpoch, state.settings.bpm);
  }

  /**
   * (Re)anchors the beat-click scheduler only when actually needed. Called
   * from both `record()` (so clicks continue through the recording itself)
   * and `startLoopPlayback()` (same epoch once the take commits, or a fresh
   * one when resuming from `stopped`) - a no-op when the epoch hasn't
   * changed, so the record()->commit transition doesn't stop-and-recreate a
   * scheduler that's already correctly anchored, which previously caused a
   * doubled click at that exact boundary (the old instance's already-queued
   * one-off event fired alongside the new instance's re-scheduled one).
   */
  private ensureBeatPeriodic(epoch: number, bpm: number): void {
    if (this.beatPeriodic && this.beatPeriodicEpoch === epoch) return;
    this.beatPeriodic?.stop();
    this.beatPeriodic = new PeriodicScheduler(this.scheduler, epoch, secondsPerBeat(bpm), (time, cycleIndex) =>
      this.onBeatTick(time, cycleIndex),
    );
    this.beatPeriodic.start();
    this.beatPeriodicEpoch = epoch;
  }

  /**
   * Seconds to delay every AUDIBLE-only sound (metronome clicks, loop
   * playback) by, so they line up with what the user actually hears of
   * their own live-monitored playing. The live monitor path has real
   * round-trip latency (capture buffering + output buffering) that a
   * synthesized click or a played-back buffer simply doesn't have, which
   * otherwise makes the click/loop feel like it's racing ahead. Delaying
   * the synthetic side by the same amount fixes the perceptual sync -
   * reusing the existing "Latency compensation" setting, since the value
   * a user dials in by ear (their monitor's round-trip latency) is exactly
   * what both this and the recording-alignment rotation need. This never
   * touches the canonical scheduling clock (loopEpoch, cycle indices,
   * capture arm/stop frames) - only how much later the sound actually
   * starts once told to play, so it can't introduce drift or gaps.
   */
  private get monitorSyncSeconds(): number {
    return this.store.getState().settings.latencyCompensationMs / 1000;
  }

  private onLoopCycle(time: number): void {
    const delayedTime = time + this.monitorSyncSeconds;
    for (const layer of this.store.getState().layers) {
      this.layerVoices.get(layer.id)?.scheduleCycle(layer.buffer, delayedTime);
    }
  }

  private onBeatTick(time: number, cycleIndex: number): void {
    const state = this.store.getState();
    if (!state.settings.metronomeEnabled) return;
    // The metronome is a recording aid, not a permanent click track: it
    // plays during the base take and during an overdub pass, and goes
    // silent again as soon as that pass ends and the loop is just playing
    // back - count-in's own click is handled separately (unconditional,
    // in record()) and isn't gated here at all.
    if (state.transport !== "recording" && state.transport !== "overdubbing") return;
    const beatsPerBar = state.settings.timeSignature.beatsPerBar;
    this.metronome.playClick(time + this.monitorSyncSeconds, cycleIndex % beatsPerBar === 0);
  }

  /** playing -> stopped (pause; layers and settings are untouched). */
  stop(): void {
    const state = this.store.getState();
    if (state.transport !== "playing") return;
    this.loopPeriodic?.stop();
    this.beatPeriodic?.stop();
    this.beatPeriodicEpoch = null;
    for (const voice of this.layerVoices.values()) voice.stopImmediately();
    this.store.setTransport("stopped");
  }

  /** stopped -> playing, resuming from a fresh epoch aligned to "now". */
  async play(): Promise<void> {
    const state = this.store.getState();
    if (state.transport !== "stopped" || state.masterLoopFrames === null) return;
    await this.ensureResumed();
    await this.ensureInputConnected();
    this.loopEpoch = this.audioContext.currentTime + LOOP_START_LEAD_SECONDS;
    this.store.setTransport("playing");
    this.startLoopPlayback();
  }

  /** Explicit overdub - never triggered automatically while a loop plays. */
  async startOverdub(): Promise<void> {
    const state = this.store.getState();
    if (state.transport !== "playing" || state.masterLoopFrames === null || this.loopEpoch === null || !this.recorder) {
      return;
    }
    await this.ensureResumed();
    const sampleRate = this.audioContext.sampleRate;
    const masterFrames = state.masterLoopFrames;
    const loopSeconds = masterFrames / sampleRate;

    let startTime: number;
    let rotationOffsetFrames: number;
    if (state.settings.overdubTrigger === "deferred") {
      const cyclesElapsed = Math.ceil((this.audioContext.currentTime - this.loopEpoch) / loopSeconds);
      startTime = this.loopEpoch + cyclesElapsed * loopSeconds;
      rotationOffsetFrames = 0;
    } else {
      startTime = this.audioContext.currentTime + 0.03;
      const phaseSeconds = wrapSeconds(startTime - this.loopEpoch, loopSeconds);
      const phaseFrames = frameAtTime(sampleRate, phaseSeconds);
      rotationOffsetFrames = wrapFrame(-phaseFrames, masterFrames);
    }

    const startFrame = frameAtTime(sampleRate, startTime);
    const stopFrame = startFrame + masterFrames;
    const capturePromise = this.recorder.arm(startFrame, stopFrame);
    this.scheduler.scheduleAt(startTime, () => this.store.setTransport("overdubbing"));

    const { samples } = await capturePromise;
    this.commitOverdubLayer(samples, rotationOffsetFrames);
  }

  private commitOverdubLayer(rawSamples: Float32Array<ArrayBuffer>, rotationOffsetFrames: number): void {
    const state = this.store.getState();
    const sampleRate = this.audioContext.sampleRate;
    const masterFrames = state.masterLoopFrames!;
    const fitted = fitToLength(rawSamples, masterFrames);
    const aligned = applyLatencyCompensation(fitted, rotationOffsetFrames, state.settings.latencyCompensationMs, sampleRate);

    const buffer = this.audioContext.createBuffer(1, masterFrames, sampleRate);
    buffer.copyToChannel(aligned, 0);

    const layer: Layer = {
      id: nextLayerId(),
      order: state.layers.length,
      buffer,
      gain: 1,
      muted: false,
      isBase: false,
      createdAt: Date.now(),
    };

    this.store.addLayer(layer);
    this.createVoiceForLayer(layer);
    this.store.setTransport("playing");
  }

  private createVoiceForLayer(layer: Layer): void {
    const voice = new LayerVoice(this.audioContext, this.masterGain, layer.gain, layer.muted);
    this.layerVoices.set(layer.id, voice);
    const state = this.store.getState();
    // Splice in immediately rather than waiting up to one full loop for the
    // next onLoopCycle - subsequent cycles then keep it in sync automatically.
    if ((state.transport === "playing" || state.transport === "overdubbing") && this.loopEpoch !== null) {
      // Include the same monitor-sync delay as onLoopCycle, or this first
      // splice-in would play slightly ahead of every cycle after it.
      voice.scheduleCycle(layer.buffer, this.audioContext.currentTime + 0.02 + this.monitorSyncSeconds);
    }
  }

  /**
   * Creates (silent, unscheduled) voices for layers that were rehydrated
   * from persistence at boot, before any user gesture has resumed the
   * AudioContext. Call `play()` once the transport is "stopped" (set via
   * `store.hydrate`) to actually start audible playback.
   */
  prepareHydratedVoices(): void {
    for (const layer of this.store.getState().layers) {
      if (!this.layerVoices.has(layer.id)) {
        const voice = new LayerVoice(this.audioContext, this.masterGain, layer.gain, layer.muted);
        this.layerVoices.set(layer.id, voice);
      }
    }
  }

  // --------------------------------------------------------- layer mixing

  setLayerGain(id: string, gain: number): void {
    this.store.updateLayer(id, { gain });
    const layer = this.store.getState().layers.find((l) => l.id === id);
    if (layer) this.layerVoices.get(id)?.setGain(gain, layer.muted);
  }

  setLayerMuted(id: string, muted: boolean): void {
    this.store.updateLayer(id, { muted });
    const layer = this.store.getState().layers.find((l) => l.id === id);
    if (layer) this.layerVoices.get(id)?.setGain(layer.gain, muted);
  }

  removeLayer(id: string): void {
    this.layerVoices.get(id)?.dispose();
    this.layerVoices.delete(id);
    this.store.removeLayer(id);
  }

  reorderLayers(fromIndex: number, toIndex: number): void {
    // Purely organizational - the gain-summed mix is order-independent.
    this.store.reorderLayers(fromIndex, toIndex);
  }

  undoOverdub(): void {
    const overdubs = this.store.getState().layers.filter((l) => !l.isBase);
    const last = overdubs[overdubs.length - 1];
    if (!last) return;
    this.layerVoices.get(last.id)?.dispose();
    this.layerVoices.delete(last.id);
    this.store.undoLastLayer();
  }

  redoOverdub(): void {
    const state = this.store.getState();
    const layer = state.redoLayer;
    if (!layer) return;
    this.createVoiceForLayer(layer);
    this.store.redoLastLayer();
  }

  clearOverdubs(): void {
    for (const l of this.store.getState().layers.filter((x) => !x.isBase)) {
      this.layerVoices.get(l.id)?.dispose();
      this.layerVoices.delete(l.id);
    }
    this.store.clearOverdubs();
  }

  /** Full reset: removes every layer, stops all scheduling, back to idle. */
  clearLoop(): void {
    this.loopPeriodic?.stop();
    this.beatPeriodic?.stop();
    this.beatPeriodicEpoch = null;
    for (const voice of this.layerVoices.values()) voice.dispose();
    this.layerVoices.clear();
    this.loopEpoch = null;
    this.recorder?.cancel();
    this.store.clearLoop();
  }

  // ----------------------------------------------------------------- export

  exportLayers(): { layers: Layer[]; masterLoopFrames: number | null; sampleRate: number } {
    const state = this.store.getState();
    return { layers: state.layers, masterLoopFrames: state.masterLoopFrames, sampleRate: this.audioContext.sampleRate };
  }

  // ------------------------------------------------------------ UI timing

  /** Pure read of current playback position, for rAF-driven UI - never used to drive audio. */
  getTimelineInfo(): TimelineInfo | null {
    const state = this.store.getState();
    if (this.loopEpoch === null || state.masterLoopFrames === null) return null;
    const sampleRate = this.audioContext.sampleRate;
    const loopSeconds = state.masterLoopFrames / sampleRate;
    const beatsPerBar = state.settings.timeSignature.beatsPerBar;
    const secPerBeat = secondsPerBeat(state.settings.bpm);
    const totalBars = Math.max(1, Math.round(loopSeconds / (secPerBeat * beatsPerBar)));

    // While paused, don't keep computing position from elapsed wall-clock
    // time - nothing is actually advancing, so the progress bar/bar-beat
    // readout would otherwise keep animating even though playback (and the
    // audio itself) has stopped. Resuming always restarts from the top of
    // the buffer (see play()), so "start of loop" is also the accurate
    // preview of what resuming will do.
    if (state.transport !== "playing" && state.transport !== "overdubbing") {
      return { bar: 1, totalBars, beat: 1, beatsPerBar, progress: 0 };
    }

    const elapsed = wrapSeconds(this.audioContext.currentTime - this.loopEpoch, loopSeconds);
    const totalBeatsElapsed = Math.floor(elapsed / secPerBeat);
    const beat = totalBeatsElapsed % beatsPerBar;
    const bar = Math.floor(totalBeatsElapsed / beatsPerBar) % totalBars;
    return {
      bar: bar + 1,
      totalBars,
      beat: beat + 1,
      beatsPerBar,
      progress: elapsed / loopSeconds,
    };
  }
}
