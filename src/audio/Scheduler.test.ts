import { describe, expect, it } from "vitest";
import { nextCycleIndex } from "./Scheduler";

describe("nextCycleIndex", () => {
  it("regression: does not skip a full extra cycle on tiny positive jitter right at a boundary", () => {
    // Exactly what happens after a Fixed Bar recording finishes: epoch is the
    // moment recording started, and by the time commitBaseLayer runs and
    // starts loop playback, currentTime is epoch + exactly one period, plus
    // a few ms of real event-loop delay. The very next cycle (index 1) -
    // not index 2 - must fire immediately, or the loop plays one full
    // silent cycle before any recorded audio is heard.
    const epoch = 10.0;
    const period = 4.8; // e.g. 2 bars at 100 BPM 4/4
    const jitterMs = [1, 5, 15, 30, 49]; // realistic microtask/event-loop delays
    for (const jitter of jitterMs) {
      const currentTime = epoch + period + jitter / 1000;
      expect(nextCycleIndex(currentTime, epoch, period)).toBe(1);
    }
  });

  it("does not fire the same cycle twice when called exactly at the epoch", () => {
    expect(nextCycleIndex(10.0, 10.0, 4.8)).toBe(0);
  });

  it("starts at index 0 when currentTime is slightly before epoch (fresh start/resume)", () => {
    // matches AudioEngine.play(): loopEpoch = currentTime + 0.05 set just before start()
    const epoch = 10.05;
    const currentTime = 10.0;
    expect(nextCycleIndex(currentTime, epoch, 4.8)).toBe(0);
  });

  it("catches up correctly after a large gap (e.g. a throttled/backgrounded tab)", () => {
    const epoch = 0;
    const period = 2;
    // 5.3 periods have elapsed - the next boundary not yet passed is index 6
    expect(nextCycleIndex(10.6, epoch, period)).toBe(6);
  });

  it("jitter tolerance does not cause it to re-fire an already-passed cycle", () => {
    // Just after cycle 3 has legitimately started (well past the tolerance window)
    const epoch = 0;
    const period = 2;
    expect(nextCycleIndex(6.2, epoch, period)).toBe(4);
  });
});
