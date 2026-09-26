import type { Layer } from "../state/types";

export interface SerializedLayer {
  id: string;
  order: number;
  gain: number;
  muted: boolean;
  isBase: boolean;
  createdAt: number;
  sampleRate: number;
  length: number;
  channelData: ArrayBuffer; // raw mono Float32 PCM bytes
}

/** AudioBuffer -> raw PCM. IndexedDB structured-clones an ArrayBuffer natively. */
export function serializeLayer(layer: Layer): SerializedLayer {
  const source = layer.buffer.getChannelData(0);
  const copy = new Float32Array(source.length); // own the memory, not a live view
  copy.set(source);
  return {
    id: layer.id,
    order: layer.order,
    gain: layer.gain,
    muted: layer.muted,
    isBase: layer.isBase,
    createdAt: layer.createdAt,
    sampleRate: layer.buffer.sampleRate,
    length: layer.buffer.length,
    channelData: copy.buffer,
  };
}

/**
 * Raw PCM -> AudioBuffer. Manual reconstruction, not decodeAudioData - that
 * API is for compressed container bytes, not already-raw PCM. The browser
 * transparently resamples AudioBufferSourceNode playback if `sampleRate`
 * differs from the current context's, so no manual resampling is needed.
 */
export function deserializeLayer(record: SerializedLayer, audioContext: AudioContext): Layer {
  const buffer = audioContext.createBuffer(1, record.length, record.sampleRate);
  buffer.copyToChannel(new Float32Array(record.channelData), 0);
  return {
    id: record.id,
    order: record.order,
    gain: record.gain,
    muted: record.muted,
    isBase: record.isBase,
    createdAt: record.createdAt,
    buffer,
  };
}
