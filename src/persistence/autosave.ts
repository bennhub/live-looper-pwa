import type { LooperStore } from "../state/store";
import { clearLayers, deleteLayer, saveLayer, saveSettings } from "./sessionRepository";

const DEBOUNCE_MS = 800;

/**
 * Subscribes to the store and debounces persistence writes. Settings always
 * persist; recorded audio only persists when the user has opted in via
 * settings.persistAudio ("Save loop across reloads"), per the refined spec -
 * loop audio is NOT saved by default. In-progress (uncommitted) capture
 * audio is never persisted, only already-committed Layer objects.
 */
export function startAutosave(store: LooperStore): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let knownLayerIds = new Set(store.getState().layers.map((l) => l.id));

  const flush = () => {
    const state = store.getState();
    saveSettings(state.settings).catch((err) => console.warn("[autosave] settings save failed", err));

    if (!state.settings.persistAudio) {
      knownLayerIds = new Set(state.layers.map((l) => l.id));
      return;
    }

    const currentIds = new Set(state.layers.map((l) => l.id));
    if (state.layers.length === 0 && knownLayerIds.size > 0) {
      clearLayers().catch((err) => console.warn("[autosave] clear layers failed", err));
    } else {
      for (const layer of state.layers) {
        saveLayer(layer).catch((err) => console.warn("[autosave] layer save failed", err));
      }
      for (const id of knownLayerIds) {
        if (!currentIds.has(id)) {
          deleteLayer(id).catch((err) => console.warn("[autosave] layer delete failed", err));
        }
      }
    }
    knownLayerIds = currentIds;
  };

  const unsubscribe = store.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
