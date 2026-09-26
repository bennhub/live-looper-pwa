import type { Layer } from "../state/types";
import { encodeWavFromAudioBuffer } from "./wavEncoder";

/**
 * Re-renders only the layer graph (never monitoring or the metronome, which
 * are structurally never routed through this graph) via OfflineAudioContext,
 * then encodes the result to a WAV Blob.
 */
export async function renderLoopToWav(
  layers: Layer[],
  masterLoopFrames: number | null,
  sampleRate: number,
): Promise<Blob> {
  if (!masterLoopFrames || layers.length === 0) {
    throw new Error("No loop to export yet");
  }
  const offlineCtx = new OfflineAudioContext(1, masterLoopFrames, sampleRate);
  for (const layer of layers) {
    if (layer.muted) continue;
    const source = offlineCtx.createBufferSource();
    source.buffer = layer.buffer;
    const gain = offlineCtx.createGain();
    gain.gain.value = layer.gain;
    source.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(0);
  }
  const rendered = await offlineCtx.startRendering();
  return encodeWavFromAudioBuffer(rendered);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
