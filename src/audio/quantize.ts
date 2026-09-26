// Pure bar/beat/sample math. Nothing here touches the Web Audio API, so it's
// fully unit-testable and never hardcodes 4/4 - beatsPerBar is always a
// parameter, so additional time signatures are architecturally free later.

export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Converts an AudioContext-clock time (seconds) to an absolute sample frame. */
export function frameAtTime(sampleRate: number, timeSeconds: number): number {
  return Math.round(timeSeconds * sampleRate);
}

export function framesPerBeat(bpm: number, sampleRate: number): number {
  return sampleRate * secondsPerBeat(bpm);
}

/** Exact frame count for a fixed-bar take. Computed before recording starts. */
export function barsToFrames(
  bpm: number,
  beatsPerBar: number,
  bars: number,
  sampleRate: number,
): number {
  return Math.round(framesPerBeat(bpm, sampleRate) * beatsPerBar * bars);
}

/** Wraps a (possibly negative or over-length) frame index into [0, length). */
export function wrapFrame(frame: number, length: number): number {
  if (length <= 0) return 0;
  return ((frame % length) + length) % length;
}

/**
 * Snaps a raw captured frame count (Free Loop Mode + Quantize ON) to the
 * nearest whole number of beats, with a floor of one beat so a very short
 * take never quantizes down to zero.
 */
export function quantizeLoopLengthFrames(
  rawFrames: number,
  bpm: number,
  sampleRate: number,
): number {
  const perBeat = framesPerBeat(bpm, sampleRate);
  const beats = Math.max(1, Math.round(rawFrames / perBeat));
  return Math.round(perBeat * beats);
}

/** Trims or zero-pads a captured buffer to exactly `targetLength` frames. */
export function fitToLength(samples: Float32Array<ArrayBuffer>, targetLength: number): Float32Array<ArrayBuffer> {
  if (samples.length === targetLength) return samples;
  const out = new Float32Array(targetLength);
  out.set(samples.subarray(0, Math.min(samples.length, targetLength)));
  return out;
}

/**
 * Rotates a mono sample array left by `offsetFrames`, wrapping around the
 * buffer. Used to realign an "immediate"-triggered overdub (or a latency
 * shift) so the stored layer always starts at loop-relative frame 0, exactly
 * like every other layer.
 */
export function rotateLeft(samples: Float32Array<ArrayBuffer>, offsetFrames: number): Float32Array<ArrayBuffer> {
  const length = samples.length;
  if (length === 0) return samples;
  const shift = wrapFrame(offsetFrames, length);
  if (shift === 0) return samples.slice();
  const out = new Float32Array(length);
  out.set(samples.subarray(shift), 0);
  out.set(samples.subarray(0, shift), length - shift);
  return out;
}
