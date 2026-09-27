import type { AudioEngine } from "../audio/AudioEngine";
import { listAudioInputDevices } from "../audio/devices";
import { downloadBlob, renderLoopToWav } from "../audio/exportWav";
import type { LooperStore } from "../state/store";
import { DEFAULT_SETTINGS } from "../state/types";
import { confirmDialog } from "./dialogs";
import { el, setDisabled, setText, toggleClass } from "./render";
import { showToast } from "./toast";

function row(label: string, control: Node): HTMLElement {
  return el("div", { class: "settings-row" }, [el("label", {}, [label]), control]);
}

export interface SettingsPanelHandle {
  dialog: HTMLDialogElement;
  open: () => void;
  close: () => void;
}

export function createSettingsPanel(engine: AudioEngine, store: LooperStore): SettingsPanelHandle {
  const dialog = el("dialog", { class: "settings-panel" }) as HTMLDialogElement;
  const closeBtn = el("button", { class: "control-btn small", type: "button" }, ["Close"]);
  closeBtn.addEventListener("click", () => dialog.close());
  const header = el("div", { class: "settings-header" }, [el("h2", {}, ["Settings"]), closeBtn]);

  // --- Tempo ---
  const bpmValue = el("span", { class: "bpm-value" }, ["100"]);
  const bpmMinus = el("button", { class: "control-btn small", type: "button" }, ["−"]);
  const bpmPlus = el("button", { class: "control-btn small", type: "button" }, ["+"]);
  const tapBtn = el("button", { class: "control-btn small", type: "button" }, ["Tap Tempo (T)"]);
  const bpmControls = el("div", { class: "inline-controls" }, [bpmMinus, bpmValue, bpmPlus, tapBtn]);

  function bpmStep(e: MouseEvent): void {
    const delta = e.shiftKey ? 5 : 1;
    const dir = (e.currentTarget as HTMLElement) === bpmPlus ? 1 : -1;
    const bpm = Math.max(30, Math.min(300, store.getState().settings.bpm + dir * delta));
    store.updateSettings({ bpm });
  }
  bpmMinus.addEventListener("click", bpmStep);
  bpmPlus.addEventListener("click", bpmStep);
  tapBtn.addEventListener("click", () => engine.tapTempo());

  const beatsPerBarSelect = el("select", {}) as HTMLSelectElement;
  for (const n of [2, 3, 4, 5, 6]) {
    beatsPerBarSelect.append(el("option", { value: String(n) }, [`${n}`]));
  }
  beatsPerBarSelect.addEventListener("change", () => {
    store.updateSettings({ timeSignature: { beatsPerBar: Number(beatsPerBarSelect.value), beatUnit: 4 } });
  });

  // --- Loop mode ---
  const fixedBarBtn = el("button", { class: "segment-btn", type: "button" }, ["Fixed Bar"]);
  const freeBtn = el("button", { class: "segment-btn", type: "button" }, ["Free"]);
  const loopModeSeg = el("div", { class: "segmented" }, [fixedBarBtn, freeBtn]);
  fixedBarBtn.addEventListener("click", () => store.updateSettings({ loopMode: "fixed-bar" }));
  freeBtn.addEventListener("click", () => store.updateSettings({ loopMode: "free" }));

  const barsSelect = el("select", {}) as HTMLSelectElement;
  for (const n of [1, 2, 4, 8, 16]) {
    barsSelect.append(el("option", { value: String(n) }, [`${n}`]));
  }
  barsSelect.addEventListener("change", () => store.updateSettings({ bars: Number(barsSelect.value) }));

  const quantizeToggle = el("button", { class: "control-btn small toggle", type: "button" }, ["Off"]);
  quantizeToggle.addEventListener("click", () => {
    store.updateSettings({ quantize: !store.getState().settings.quantize });
  });

  // --- Count-in ---
  const countInToggle = el("button", { class: "control-btn small toggle", type: "button" }, ["On"]);
  countInToggle.addEventListener("click", () => {
    store.updateSettings({ countInEnabled: !store.getState().settings.countInEnabled });
  });
  const countInBarsSelect = el("select", {}) as HTMLSelectElement;
  for (const n of [1, 2]) {
    countInBarsSelect.append(el("option", { value: String(n) }, [`${n} bar${n > 1 ? "s" : ""}`]));
  }
  countInBarsSelect.addEventListener("change", () => {
    store.updateSettings({ countInBars: Number(countInBarsSelect.value) });
  });

  const metronomeVolume = el("input", { type: "range", min: "0", max: "1", step: "0.01" }) as HTMLInputElement;
  metronomeVolume.addEventListener("input", () => engine.setMetronomeVolume(Number(metronomeVolume.value)));

  // --- Overdub ---
  const deferredBtn = el("button", { class: "segment-btn", type: "button" }, ["Next Loop Start"]);
  const immediateBtn = el("button", { class: "segment-btn", type: "button" }, ["Immediate"]);
  const overdubSeg = el("div", { class: "segmented" }, [deferredBtn, immediateBtn]);
  deferredBtn.addEventListener("click", () => store.updateSettings({ overdubTrigger: "deferred" }));
  immediateBtn.addEventListener("click", () => store.updateSettings({ overdubTrigger: "immediate" }));

  // --- Latency ---
  const latencySlider = el("input", { type: "range", min: "-100", max: "800", step: "1" }) as HTMLInputElement;
  const latencyValue = el("span", {}, ["0 ms"]);
  latencySlider.addEventListener("input", () => {
    store.updateSettings({ latencyCompensationMs: Number(latencySlider.value) });
  });

  // --- Monitor ---
  const monitorVolume = el("input", { type: "range", min: "0", max: "1", step: "0.01" }) as HTMLInputElement;
  monitorVolume.addEventListener("input", () => engine.setMonitorVolume(Number(monitorVolume.value)));

  // --- Input device ---
  const deviceSelect = el("select", {}) as HTMLSelectElement;
  const refreshDevicesBtn = el("button", { class: "control-btn small", type: "button" }, ["Refresh"]);
  async function refreshDevices(): Promise<void> {
    const devices = await listAudioInputDevices();
    const current = store.getState().settings.inputDeviceId;
    deviceSelect.replaceChildren();
    deviceSelect.append(el("option", { value: "" }, ["System default"]));
    for (const d of devices) {
      const opt = el("option", { value: d.deviceId }, [d.label]);
      if (d.deviceId === current) opt.selected = true;
      deviceSelect.append(opt);
    }
  }
  refreshDevicesBtn.addEventListener("click", () => void refreshDevices());
  deviceSelect.addEventListener("change", () => {
    void engine.setInputDevice(deviceSelect.value || null);
  });

  // --- Persistence ---
  const persistToggle = el("button", { class: "control-btn small toggle", type: "button" }, ["Off"]);
  persistToggle.addEventListener("click", () => {
    store.updateSettings({ persistAudio: !store.getState().settings.persistAudio });
  });

  // --- Actions ---
  const exportBtn = el("button", { class: "control-btn", type: "button" }, ["Export WAV"]);
  exportBtn.addEventListener("click", () => {
    void (async () => {
      const { layers, masterLoopFrames, sampleRate } = engine.exportLayers();
      try {
        const blob = await renderLoopToWav(layers, masterLoopFrames, sampleRate);
        downloadBlob(blob, `live-looper-${Date.now()}.wav`);
      } catch {
        showToast("Nothing to export yet — record a loop first.");
      }
    })();
  });
  const redoBtn = el("button", { class: "control-btn", type: "button" }, ["Redo Overdub"]);
  redoBtn.addEventListener("click", () => engine.redoOverdub());
  const clearOverdubsBtn = el("button", { class: "control-btn", type: "button" }, ["Clear Overdubs"]);
  clearOverdubsBtn.addEventListener("click", () => engine.clearOverdubs());
  const clearSessionBtn = el("button", { class: "control-btn danger", type: "button" }, ["Clear Session"]);
  clearSessionBtn.addEventListener("click", () => {
    void (async () => {
      if (await confirmDialog("Reset all settings and clear the current loop?", "Reset")) {
        engine.clearLoop();
        store.updateSettings(DEFAULT_SETTINGS);
      }
    })();
  });

  const limitationsNote = el("p", { class: "limitations-note" }, [
    "Browser monitoring always has some latency — for near-zero delay, use your interface's own \"direct monitor\" switch instead. " +
      "If you do, turn this app's Monitor off too, or you'll hear an echoey double.",
  ]);

  const body = el("div", { class: "settings-body" }, [
    el("h3", {}, ["Tempo"]),
    row("BPM", bpmControls),
    row("Time signature (beats/bar)", beatsPerBarSelect),

    el("h3", {}, ["Loop"]),
    row("Loop mode", loopModeSeg),
    row("Bars (Fixed Bar mode)", barsSelect),
    row("Quantize (Free mode)", quantizeToggle),

    el("h3", {}, ["Count-in & Metronome"]),
    row("Count-in", countInToggle),
    row("Count-in length", countInBarsSelect),
    row("Metronome volume", metronomeVolume),

    el("h3", {}, ["Overdub"]),
    row("Overdub trigger", overdubSeg),

    el("h3", {}, ["Monitor & Recording Sync"]),
    row("Latency compensation (ms)", el("div", { class: "inline-controls" }, [latencySlider, latencyValue])),
    el("p", { class: "limitations-note" }, [
      "Delays the click/loop and shifts new recordings to match your monitor's latency. " +
        "Play along with the click and increase until it feels tight.",
    ]),

    el("h3", {}, ["Input & Monitoring"]),
    row("Input device", el("div", { class: "inline-controls" }, [deviceSelect, refreshDevicesBtn])),
    row("Monitor volume", monitorVolume),
    limitationsNote,

    el("h3", {}, ["Session"]),
    row("Save loop across reloads", persistToggle),
    el("div", { class: "controls-row" }, [exportBtn, redoBtn, clearOverdubsBtn, clearSessionBtn]),
  ]);

  dialog.append(header, body);
  document.body.appendChild(dialog);

  function render(): void {
    const s = store.getState().settings;
    setText(bpmValue, `${s.bpm} BPM`);
    beatsPerBarSelect.value = String(s.timeSignature.beatsPerBar);

    toggleClass(fixedBarBtn, "active", s.loopMode === "fixed-bar");
    toggleClass(freeBtn, "active", s.loopMode === "free");
    barsSelect.value = String(s.bars);
    setDisabled(barsSelect, s.loopMode !== "fixed-bar");

    setText(quantizeToggle, s.quantize ? "On" : "Off");
    toggleClass(quantizeToggle, "active", s.quantize);
    setDisabled(quantizeToggle, s.loopMode === "fixed-bar");
    quantizeToggle.title =
      s.loopMode === "fixed-bar" ? "Fixed Bar mode is already grid-locked by construction." : "";

    setText(countInToggle, s.countInEnabled ? "On" : "Off");
    toggleClass(countInToggle, "active", s.countInEnabled);
    countInBarsSelect.value = String(s.countInBars);
    setDisabled(countInBarsSelect, !s.countInEnabled);

    metronomeVolume.value = String(s.metronomeVolume);

    toggleClass(deferredBtn, "active", s.overdubTrigger === "deferred");
    toggleClass(immediateBtn, "active", s.overdubTrigger === "immediate");

    latencySlider.value = String(s.latencyCompensationMs);
    setText(latencyValue, `${s.latencyCompensationMs} ms`);

    monitorVolume.value = String(s.monitorVolume);

    setText(persistToggle, s.persistAudio ? "On" : "Off");
    toggleClass(persistToggle, "active", s.persistAudio);
  }

  store.subscribe(render);
  render();
  void refreshDevices();

  return {
    dialog,
    open: () => {
      render();
      dialog.showModal();
    },
    close: () => dialog.close(),
  };
}
