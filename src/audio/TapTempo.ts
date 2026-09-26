// Pure tap-tempo BPM calculation. The caller passes in timestamps (e.g.
// performance.now()) so this class has no clock calls of its own and is
// fully unit-testable.

const MAX_TAPS = 8;
const RESET_GAP_MS = 2000;
const MIN_BPM = 30;
const MAX_BPM = 300;

export class TapTempo {
  private tapTimes: number[] = [];

  /** Records a tap and returns the current BPM estimate, or null if not enough taps yet. */
  recordTap(nowMs: number): number | null {
    const last = this.tapTimes[this.tapTimes.length - 1];
    if (last !== undefined && nowMs - last > RESET_GAP_MS) {
      this.tapTimes = [];
    }
    this.tapTimes.push(nowMs);
    if (this.tapTimes.length > MAX_TAPS) {
      this.tapTimes.shift();
    }
    return this.currentBpm();
  }

  currentBpm(): number | null {
    if (this.tapTimes.length < 2) return null;
    const intervals: number[] = [];
    for (let i = 1; i < this.tapTimes.length; i++) {
      intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgMs <= 0) return null;
    const bpm = 60000 / avgMs;
    return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
  }

  reset(): void {
    this.tapTimes = [];
  }
}
