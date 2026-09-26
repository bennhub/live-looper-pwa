import type { Layer, Settings } from "../state/types";
import { DEFAULT_SETTINGS } from "../state/types";
import { idbClear, idbDelete, idbGet, idbGetAll, idbPut } from "./db";
import { deserializeLayer, serializeLayer, type SerializedLayer } from "./serialize";

const SETTINGS_KEY = "current";

/** Settings always persist, regardless of the persistAudio toggle. */
export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await idbGet<Settings>("settings", SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    // Merge over defaults so missing/older keys (e.g. after a future field is
    // added) degrade sanely instead of producing an incomplete Settings object.
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      timeSignature: { ...DEFAULT_SETTINGS.timeSignature, ...stored.timeSignature },
    };
  } catch (err) {
    console.warn("[sessionRepository] failed to load settings, using defaults", err);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await idbPut("settings", settings, SETTINGS_KEY);
}

/** Only called when the user has opted into "Save loop across reloads". */
export async function loadLayers(audioContext: AudioContext): Promise<Layer[]> {
  try {
    const records = await idbGetAll<SerializedLayer>("layers");
    return records.sort((a, b) => a.order - b.order).map((r) => deserializeLayer(r, audioContext));
  } catch (err) {
    console.warn("[sessionRepository] failed to load layers", err);
    return [];
  }
}

export async function saveLayer(layer: Layer): Promise<void> {
  await idbPut("layers", serializeLayer(layer));
}

export async function deleteLayer(id: string): Promise<void> {
  await idbDelete("layers", id);
}

export async function clearLayers(): Promise<void> {
  await idbClear("layers");
}
