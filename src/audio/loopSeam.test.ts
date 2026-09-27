import { describe, expect, it } from "vitest";
import { applyLoopSeamFade } from "./loopSeam";

describe("applyLoopSeamFade", () => {
  it("fades the first and last samples toward silence, eliminating the seam discontinuity", () => {
    const samples = new Float32Array(100).fill(1); // constant full-scale signal
    const sampleRate = 1000; // 1 sample = 1ms, easy to reason about
    const out = applyLoopSeamFade(samples, sampleRate, 8); // 8ms fade = 8 samples

    expect(out[0]).toBeCloseTo(0, 5); // first sample faded to ~0
    expect(out[out.length - 1]).toBeCloseTo(0, 5); // last sample faded to ~0
    expect(out[4]).toBeCloseTo(0.5, 5); // linear ramp midpoint
    expect(out[out.length - 5]).toBeCloseTo(0.5, 5);
  });

  it("leaves samples outside the fade window untouched", () => {
    const samples = new Float32Array(100).fill(1);
    const out = applyLoopSeamFade(samples, 1000, 8);
    expect(out[50]).toBe(1);
  });

  it("does not mutate the input array", () => {
    const samples = new Float32Array(100).fill(1);
    applyLoopSeamFade(samples, 1000, 8);
    expect(samples[0]).toBe(1);
  });

  it("clamps the fade to at most half the buffer for a very short take", () => {
    const samples = new Float32Array(10).fill(1);
    const out = applyLoopSeamFade(samples, 1000, 8); // would ask for 8 samples on each side of a 10-sample buffer
    // should not throw, and should still fade both ends without overlapping weirdly
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[out.length - 1]).toBeCloseTo(0, 5);
  });

  it("is a no-op for an empty buffer", () => {
    const out = applyLoopSeamFade(new Float32Array(0), 1000, 8);
    expect(out.length).toBe(0);
  });
});
