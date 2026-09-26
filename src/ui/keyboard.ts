import type { AudioEngine } from "../audio/AudioEngine";
import { describeMicError } from "../audio/micErrors";
import type { LooperStore } from "../state/store";
import { primaryActionFor } from "./TransportView";
import { runCatching } from "./toast";

export interface KeyboardBindingsOptions {
  isSettingsOpen: () => boolean;
  closeSettings: () => void;
}

/** Space/O/M/T/Backspace/Escape - ignored while focus is in a text/number input. */
export function bindKeyboardShortcuts(engine: AudioEngine, store: LooperStore, options: KeyboardBindingsOptions): void {
  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
      return;
    }

    switch (event.key) {
      case " ":
      case "Spacebar":
        event.preventDefault();
        runCatching(() => primaryActionFor(store.getState().transport)?.run(engine), describeMicError);
        break;
      case "o":
      case "O":
        runCatching(() => engine.startOverdub(), describeMicError);
        break;
      case "m":
      case "M":
        engine.toggleMetronomeEnabled();
        break;
      case "t":
      case "T":
        engine.tapTempo();
        break;
      case "Backspace":
        event.preventDefault();
        engine.undoOverdub();
        break;
      case "Escape":
        if (options.isSettingsOpen()) {
          options.closeSettings();
        } else {
          engine.cancelRecording();
        }
        break;
      default:
        break;
    }
  });
}
