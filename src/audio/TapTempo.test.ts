import { beforeEach, describe, expect, it } from "vitest";
import { TapTempo } from "./TapTempo";

describe("TapTempo", () => {
  let tempo: TapTempo;
  beforeEach(() => {
    tempo = new TapTempo();
  });

  it("returns null until at least two taps are recorded", () => {
    expect(tempo.recordTap(0)).toBeNull();
  });

  it("converges on a steady tap interval", () => {
    // 500ms between taps == 120 BPM
    tempo.recordTap(0);
    tempo.recordTap(500);
    const bpm = tempo.recordTap(1000);
    expect(bpm).toBe(120);
  });

  it("resets the rolling window after a long pause", () => {
    tempo.recordTap(0);
    tempo.recordTap(500); // 120 BPM
    tempo.recordTap(5000); // > 2s gap, should reset
    expect(tempo.recordTap(5500)).toBe(120); // fresh pair, still 500ms apart
  });

  it("clamps to the supported BPM range", () => {
    tempo.recordTap(0);
    const bpm = tempo.recordTap(20); // 20ms apart -> way above 300 BPM
    expect(bpm).toBe(300);
  });

  it("reset() clears the tap history", () => {
    tempo.recordTap(0);
    tempo.recordTap(500);
    tempo.reset();
    expect(tempo.recordTap(600)).toBeNull();
  });
});
