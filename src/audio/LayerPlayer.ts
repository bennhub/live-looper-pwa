// Per-layer playback voice: a persistent GainNode (survives across cycles,
// carries volume/mute) plus a fresh, single-use AudioBufferSourceNode created
// every loop cycle. Manual per-cycle rescheduling (rather than
// AudioBufferSourceNode.loop = true) is what lets layers be added/removed
// exactly at loop boundaries while every layer restarts at an identical,
// shared audio-clock timestamp - zero relative drift between layers.

export class LayerVoice {
  readonly gainNode: GainNode;
  private readonly audioContext: AudioContext;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor(audioContext: AudioContext, destination: AudioNode, initialGain: number, muted: boolean) {
    this.audioContext = audioContext;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = muted ? 0 : initialGain;
    this.gainNode.connect(destination);
  }

  setGain(gain: number, muted: boolean): void {
    this.gainNode.gain.value = muted ? 0 : gain;
  }

  /** Schedules this layer's buffer to start at `time`, stopping any earlier voice first. */
  scheduleCycle(buffer: AudioBuffer, time: number): void {
    this.currentSource?.stop(time);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    source.start(time);
    this.currentSource = source;
  }

  stopImmediately(): void {
    try {
      this.currentSource?.stop();
    } catch {
      // already stopped
    }
    this.currentSource = null;
  }

  dispose(): void {
    this.stopImmediately();
    this.gainNode.disconnect();
  }
}
