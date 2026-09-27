// Every sample-based looper has this problem: press record/stop mid-waveform
// (not at a zero-crossing) and the buffer's first and last samples land at
// some arbitrary, usually non-zero, amplitude. When the loop wraps from the
// last sample back to the first, that's a sudden jump in the waveform - an
// audible click/discontinuity right at the seam. It's easy to mistake for
// "the loop isn't quite seamless" or a timing gap, but it's an amplitude
// problem, not a timing one, and no amount of button-press precision fixes
// it (real hardware loop pedals have the exact same issue and use the same
// fix). A short fade in at the very start and out at the very end smooths
// the jump into an unnoticeable dip instead of a hard click.

/** Applies a short linear fade-in/fade-out at the buffer edges to eliminate
 * an amplitude discontinuity at the loop seam. Operates on already-finalized
 * sample content (after trimming/rotation/latency-shift), so the fade always
 * targets the actual start/end of what will be looped. */
export function applyLoopSeamFade(
  samples: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fadeMs = 8,
): Float32Array<ArrayBuffer> {
  const fadeFrames = Math.min(Math.round((fadeMs / 1000) * sampleRate), Math.floor(samples.length / 2));
  if (fadeFrames <= 0) return samples;
  const out = samples.slice();
  for (let i = 0; i < fadeFrames; i++) {
    const gain = i / fadeFrames;
    out[i] *= gain; // fade in from the start
    out[out.length - 1 - i] *= gain; // fade out toward the end
  }
  return out;
}
