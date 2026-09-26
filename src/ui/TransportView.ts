import type { AudioEngine } from "../audio/AudioEngine";
import type { LooperStore } from "../state/store";
import type { TransportState } from "../state/types";
import { confirmDialog } from "./dialogs";
import { el, setDisabled, setText, toggleClass } from "./render";
import { runCatching } from "./toast";

const STATE_LABELS: Record<TransportState, string> = {
  idle: "IDLE",
  "count-in": "COUNT-IN",
  recording: "RECORDING",
  playing: "PLAYING",
  overdubbing: "OVERDUBBING",
  stopped: "STOPPED",
};

/**
 * The transport's primary button is context-sensitive on the current state -
 * this mapping is shared with the Space-bar keyboard shortcut so both stay
 * in lockstep.
 */
export function primaryActionFor(
  transport: TransportState,
): { label: string; run: (engine: AudioEngine) => void | Promise<void> } | null {
  switch (transport) {
    case "idle":
      return { label: "Record", run: (e) => e.record() };
    case "recording":
      return { label: "Stop", run: (e) => e.stopRecording() };
    case "count-in":
      return { label: "Cancel", run: (e) => e.cancelRecording() };
    case "playing":
      return { label: "Stop", run: (e) => e.stop() };
    case "stopped":
      return { label: "Play", run: (e) => e.play() };
    case "overdubbing":
      return null; // overdub always auto-stops after exactly one loop cycle
  }
}

export function createTransportView(engine: AudioEngine, store: LooperStore): HTMLElement {
  const root = el("section", { class: "transport" });

  const statusChip = el("div", { class: "status-chip" }, ["IDLE"]);
  const bpmDisplay = el("div", { class: "bpm-display" }, ["100 BPM"]);
  const barBeat = el("div", { class: "bar-beat" }, ["BAR – / –  ·  BEAT – / –"]);
  const progressFill = el("div", { class: "loop-progress-fill" });
  const progress = el("div", { class: "loop-progress" }, [progressFill]);

  const primaryBtn = el("button", { class: "primary-btn", type: "button" }, ["Record"]);
  const overdubBtn = el("button", { class: "control-btn overdub", type: "button" }, ["Overdub"]);
  const undoBtn = el("button", { class: "control-btn", type: "button" }, ["Undo"]);
  const clearBtn = el("button", { class: "control-btn", type: "button" }, ["Clear Loop"]);
  const monitorBtn = el("button", { class: "control-btn toggle", type: "button" }, ["Monitor: On"]);
  const metronomeBtn = el("button", { class: "control-btn toggle", type: "button" }, ["Metronome: On"]);

  const levelFill = el("div", { class: "level-meter-fill" });
  const levelMeter = el("div", { class: "level-meter" }, [levelFill]);

  const controls = el("div", { class: "controls-row" }, [overdubBtn, undoBtn, clearBtn]);
  const toggles = el("div", { class: "controls-row" }, [monitorBtn, metronomeBtn]);

  root.append(statusChip, bpmDisplay, barBeat, progress, primaryBtn, controls, toggles, levelMeter);

  primaryBtn.addEventListener("click", () => {
    runCatching(
      () => primaryActionFor(store.getState().transport)?.run(engine),
      "Microphone access was denied or unavailable. Check permissions and try again.",
    );
  });
  overdubBtn.addEventListener("click", () => {
    runCatching(() => engine.startOverdub(), "Couldn't start overdub — check microphone access.");
  });
  undoBtn.addEventListener("click", () => engine.undoOverdub());
  clearBtn.addEventListener("click", () => {
    void (async () => {
      if (await confirmDialog("Clear the entire loop? This can't be undone.", "Clear Loop")) {
        engine.clearLoop();
      }
    })();
  });
  monitorBtn.addEventListener("click", () => {
    engine.setMonitorEnabled(!store.getState().settings.monitorEnabled);
  });
  metronomeBtn.addEventListener("click", () => engine.toggleMetronomeEnabled());

  function render(): void {
    const state = store.getState();
    setText(statusChip, STATE_LABELS[state.transport]);
    root.dataset.state = state.transport;
    setText(bpmDisplay, `${state.settings.bpm} BPM`);

    const action = primaryActionFor(state.transport);
    setText(primaryBtn, action?.label ?? "…");
    setDisabled(primaryBtn, !action);

    setDisabled(overdubBtn, state.transport !== "playing");
    setDisabled(undoBtn, !state.layers.some((l) => !l.isBase));
    setDisabled(clearBtn, state.transport === "idle");

    setText(monitorBtn, `Monitor: ${state.settings.monitorEnabled ? "On" : "Off"}`);
    toggleClass(monitorBtn, "active", state.settings.monitorEnabled);
    setText(metronomeBtn, `Metronome: ${state.settings.metronomeEnabled ? "On" : "Off"}`);
    toggleClass(metronomeBtn, "active", state.settings.metronomeEnabled);
  }

  store.subscribe(render);
  render();

  // rAF loop for bar/beat + loop progress + input level - reads
  // AudioContext.currentTime directly, never setInterval, so visuals never
  // desync from actual audio timing.
  const analyser = engine.getAnalyser();
  const levelData = new Uint8Array(analyser.fftSize);
  function frame(): void {
    const info = engine.getTimelineInfo();
    if (info) {
      setText(barBeat, `BAR ${info.bar}/${info.totalBars} · BEAT ${info.beat}/${info.beatsPerBar}`);
      progressFill.style.width = `${Math.max(0, Math.min(1, info.progress)) * 100}%`;
    } else {
      setText(barBeat, "BAR – / –  ·  BEAT – / –");
      progressFill.style.width = "0%";
    }

    analyser.getByteTimeDomainData(levelData);
    let peak = 0;
    for (const v of levelData) peak = Math.max(peak, Math.abs(v - 128));
    levelFill.style.width = `${Math.min(1, peak / 128) * 100}%`;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return root;
}
