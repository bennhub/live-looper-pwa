import { describe, expect, it } from "vitest";
import { barsToFrames, fitToLength, frameAtTime, framesPerBeat, quantizeLoopLengthFrames, rotateLeft, wrapFrame } from "./quantize";

describe("framesPerBeat / barsToFrames", () => {
  it("computes exact frames for a simple case", () => {
    // 120 BPM -> 0.5s/beat, 48000 sample rate -> 24000 frames/beat
    expect(framesPerBeat(120, 48000)).toBe(24000);
  });

  it("computes bar length independent of time signature (not hardcoded to 4/4)", () => {
    expect(barsToFrames(120, 4, 2, 48000)).toBe(24000 * 4 * 2);
    expect(barsToFrames(120, 3, 2, 48000)).toBe(24000 * 3 * 2);
    expect(barsToFrames(90, 6, 1, 44100)).toBe(Math.round(framesPerBeat(90, 44100) * 6));
  });
});

describe("frameAtTime", () => {
  it("converts context time to an absolute sample frame", () => {
    expect(frameAtTime(48000, 1.5)).toBe(72000);
  });
});

describe("wrapFrame", () => {
  it("wraps positive overflow", () => {
    expect(wrapFrame(105, 100)).toBe(5);
  });
  it("wraps negative values into range", () => {
    expect(wrapFrame(-5, 100)).toBe(95);
  });
  it("returns 0 for a non-positive length", () => {
    expect(wrapFrame(5, 0)).toBe(0);
  });
});

describe("quantizeLoopLengthFrames", () => {
  it("snaps a raw take to the nearest whole beat count", () => {
    const perBeat = framesPerBeat(120, 48000); // 24000
    // slightly over 2 beats worth of frames should snap to exactly 2 beats
    expect(quantizeLoopLengthFrames(perBeat * 2 + 500, 120, 48000)).toBe(perBeat * 2);
  });

  it("never quantizes down to zero beats", () => {
    expect(quantizeLoopLengthFrames(10, 120, 48000)).toBe(framesPerBeat(120, 48000));
  });
});

describe("fitToLength", () => {
  it("zero-pads a short buffer", () => {
    expect(Array.from(fitToLength(new Float32Array([1, 2]), 4))).toEqual([1, 2, 0, 0]);
  });
  it("trims a long buffer", () => {
    expect(Array.from(fitToLength(new Float32Array([1, 2, 3, 4]), 2))).toEqual([1, 2]);
  });
  it("returns the same array when already the right length", () => {
    const samples = new Float32Array([1, 2, 3]);
    expect(fitToLength(samples, 3)).toBe(samples);
  });
});

describe("rotateLeft", () => {
  it("rotates samples so playback-phase offset becomes loop-relative 0", () => {
    const samples = new Float32Array([0, 1, 2, 3, 4, 5]);
    expect(Array.from(rotateLeft(samples, 2))).toEqual([2, 3, 4, 5, 0, 1]);
  });

  it("wraps an offset larger than the buffer", () => {
    const samples = new Float32Array([0, 1, 2, 3]);
    expect(Array.from(rotateLeft(samples, 6))).toEqual(Array.from(rotateLeft(samples, 2)));
  });

  it("is a no-op for offset 0", () => {
    const samples = new Float32Array([0, 1, 2]);
    expect(Array.from(rotateLeft(samples, 0))).toEqual([0, 1, 2]);
  });
});
