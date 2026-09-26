import "./style.css";
import { AudioEngine } from "./audio/AudioEngine";
import { startAutosave } from "./persistence/autosave";
import { loadLayers, loadSettings } from "./persistence/sessionRepository";
import { initServiceWorker } from "./pwa/registerSW";
import { LooperStore } from "./state/store";
import { checkCapabilities } from "./support/capabilities";
import { bindKeyboardShortcuts } from "./ui/keyboard";
import { createMixerView } from "./ui/MixerView";
import { el } from "./ui/render";
import { createSettingsPanel } from "./ui/SettingsPanel";
import { createTransportView } from "./ui/TransportView";
import { runCatching } from "./ui/toast";

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("#app root element missing");

  const capabilities = checkCapabilities();
  if (!capabilities.supported) {
    app.append(
      el("div", { class: "unsupported" }, [
        el("h1", {}, ["Browser not supported"]),
        el("p", {}, [
          `Live Looper needs: ${capabilities.missing.join(", ")}. ` +
            "Please try the latest Chrome, Edge, Firefox, or Safari.",
        ]),
      ]),
    );
    return;
  }

  const settings = await loadSettings();
  const store = new LooperStore(settings);
  const engine = new AudioEngine(store);

  // If a prior session opted into "Save loop across reloads", rehydrate the
  // layers now. The session starts "stopped" (never autoplaying) behind a
  // tap-to-resume gesture gate, since AudioContext can't run without one.
  let needsResumeGesture = false;
  if (settings.persistAudio) {
    const layers = await loadLayers(engine.audioContext);
    if (layers.length > 0) {
      store.hydrate({ layers, transport: "stopped", masterLoopFrames: layers[0].buffer.length });
      engine.prepareHydratedVoices();
      needsResumeGesture = true;
    }
  }

  startAutosave(store);

  const settingsPanel = createSettingsPanel(engine, store);
  const settingsBtn = el("button", { class: "control-btn small", type: "button" }, ["⚙ Settings"]);
  settingsBtn.addEventListener("click", () => settingsPanel.open());
  const header = el("header", { class: "app-header" }, [el("h1", {}, ["Live Looper"]), settingsBtn]);

  const transportView = createTransportView(engine, store);
  const mixerView = createMixerView(engine, store);
  app.append(header, transportView, mixerView);

  bindKeyboardShortcuts(engine, store, {
    isSettingsOpen: () => settingsPanel.dialog.open,
    closeSettings: () => settingsPanel.close(),
  });

  if (needsResumeGesture) {
    const resumeBtn = el("button", { class: "primary-btn", type: "button" }, ["Tap to resume session"]);
    const overlay = el("div", { class: "resume-overlay" }, [
      el("p", {}, ["A previous loop was found."]),
      resumeBtn,
    ]);
    resumeBtn.addEventListener("click", () => {
      runCatching(async () => {
        await engine.play();
        overlay.remove();
      }, "Couldn't resume the saved session — check microphone access.");
    });
    app.append(overlay);
  }

  initServiceWorker();
}

void main();
