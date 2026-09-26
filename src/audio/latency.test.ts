import { describe, expect, it } from "vitest";
import { applyLatencyCompensation, msToFrameShift } from "./latency";

describe("msToFrameShift", () => {
  it("converts a positive ms offset to frames", () => {
    expect(msToFrameShift(10, 48000)).toBe(480);
  });
  it("converts a negative ms offset to a negative frame shift", () => {
    expect(msToFrameShift(-10, 48000)).toBe(-480);
  });
});

describe("applyLatencyCompensation", () => {
  it("combines rotation offset and latency shift into one rotation", () => {
    const samples = new Float32Array([0, 1, 2, 3, 4, 5]);
    // rotationOffset 1 + latency shift equivalent to 1 frame => total 2
    const oneFrameMs = (1 / 6) * 1000; // sampleRate 6 in this toy example
    const result = applyLatencyCompensation(samples, 1, oneFrameMs, 6);
    expect(Array.from(result)).toEqual([2, 3, 4, 5, 0, 1]);
  });

  it("is a no-op when both offsets are zero", () => {
    const samples = new Float32Array([0, 1, 2]);
    expect(Array.from(applyLatencyCompensation(samples, 0, 0, 48000))).toEqual([0, 1, 2]);
  });
});
