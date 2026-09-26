import { rotateLeft, wrapFrame } from "./quantize";

/** Converts a signed ms offset to a signed frame-count shift. */
export function msToFrameShift(ms: number, sampleRate: number): number {
  return Math.round((ms / 1000) * sampleRate);
}

/**
 * Combines a capture's playback-phase rotation offset (from an "immediate"
 * overdub trigger) with the user's latency-compensation shift, then applies
 * both as a single rotation so alignment stays exact and relative ordering
 * between layers is preserved.
 */
export function applyLatencyCompensation(
  samples: Float32Array<ArrayBuffer>,
  rotationOffsetFrames: number,
  latencyCompensationMs: number,
  sampleRate: number,
): Float32Array<ArrayBuffer> {
  const latencyShift = msToFrameShift(latencyCompensationMs, sampleRate);
  const totalOffset = wrapFrame(rotationOffsetFrames + latencyShift, samples.length);
  return rotateLeft(samples, totalOffset);
}
