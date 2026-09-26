// Lookahead scheduler - Chris Wilson's "A Tale of Two Clocks" pattern.
// A setInterval tick looks a short window ahead into AudioContext.currentTime
// and fires callbacks that themselves call .start(scheduledTime) on audio
// nodes. Precision comes from the audio-clock timestamp passed to .start(),
// never from when the JS timer callback happens to actually run.

const TICK_INTERVAL_MS = 25;
const LOOKAHEAD_SECONDS = 0.1;

// Absorbs the few ms of real event-loop/microtask delay between a cycle
// boundary actually occurring and PeriodicScheduler.start() running for it
// (e.g. right after a base-loop recording's capture completes exactly one
// period after its epoch). Without this, `nextCycleIndex` rounds a tiny
// positive overshoot UP via ceil() and skips an entire extra cycle before
// anything is audible - a full silent loop before playback ever starts.
const START_TOLERANCE_SECONDS = 0.05;

/**
 * Which cycle index should fire next, given how far past `epoch` `currentTime`
 * already is. Exported (pure, no AudioContext needed) so the exact-boundary
 * rounding behavior is unit-testable on its own.
 */
export function nextCycleIndex(currentTime: number, epoch: number, periodSeconds: number): number {
  const elapsed = currentTime - epoch - START_TOLERANCE_SECONDS;
  return Math.max(0, Math.ceil(elapsed / periodSeconds));
}

interface PendingEvent {
  time: number;
  callback: (time: number) => void;
}

/** Generic one-off lookahead event scheduler. */
export class Scheduler {
  private readonly audioContext: AudioContext;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private pending: PendingEvent[] = [];
  private refillCallbacks = new Set<() => void>();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /** Schedules a single callback to fire at (approximately, audio-clock-accurate) `time`. */
  scheduleAt(time: number, callback: (time: number) => void): void {
    this.pending.push({ time, callback });
  }

  /**
   * Registers a callback invoked on every tick, before due events fire -
   * used by PeriodicScheduler to top up its queue of upcoming cycle events
   * so recurring events never depend on a self-rearming setTimeout chain.
   */
  onTick(callback: () => void): () => void {
    this.refillCallbacks.add(callback);
    return () => this.refillCallbacks.delete(callback);
  }

  /** Cancels every not-yet-fired event. */
  clear(): void {
    this.pending = [];
  }

  start(): void {
    if (this.timerId !== null) return;
    this.timerId = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.clear();
  }

  get currentTime(): number {
    return this.audioContext.currentTime;
  }

  private tick(): void {
    for (const refill of this.refillCallbacks) refill();
    const horizon = this.audioContext.currentTime + LOOKAHEAD_SECONDS;
    const due = this.pending.filter((e) => e.time < horizon);
    if (due.length === 0) return;
    this.pending = this.pending.filter((e) => e.time >= horizon);
    // Fire in scheduled-time order so simultaneous-ish events stay predictable.
    due.sort((a, b) => a.time - b.time);
    for (const event of due) event.callback(event.time);
  }
}

/**
 * Emits recurring events at `epoch + n * periodSeconds` for increasing n,
 * computed by pure multiplication from a fixed epoch (never by iteratively
 * adding to the previous boundary) - this is what eliminates cumulative
 * floating-point drift over a long session. Used for loop restarts and for
 * metronome clicks phase-locked to the same epoch.
 */
export class PeriodicScheduler {
  private readonly scheduler: Scheduler;
  private readonly epoch: number;
  private periodSeconds: number;
  private readonly onEvent: (scheduledTime: number, cycleIndex: number) => void;
  private nextIndex = 0;
  private unregister: (() => void) | null = null;

  constructor(
    scheduler: Scheduler,
    epoch: number,
    periodSeconds: number,
    onEvent: (scheduledTime: number, cycleIndex: number) => void,
  ) {
    this.scheduler = scheduler;
    this.epoch = epoch;
    this.periodSeconds = periodSeconds;
    this.onEvent = onEvent;
  }

  /** (Re)starts emission from the first cycle at/after AudioContext.currentTime. */
  start(): void {
    this.nextIndex = nextCycleIndex(this.scheduler.currentTime, this.epoch, this.periodSeconds);
    this.unregister?.();
    this.unregister = this.scheduler.onTick(() => this.refill());
    this.refill();
  }

  stop(): void {
    this.unregister?.();
    this.unregister = null;
  }

  /** Changes the period (e.g. BPM changed) without touching the fixed epoch already in flight. */
  setPeriod(periodSeconds: number): void {
    this.periodSeconds = periodSeconds;
  }

  private refill(): void {
    const horizon = this.scheduler.currentTime + LOOKAHEAD_SECONDS;
    while (this.epoch + this.nextIndex * this.periodSeconds < horizon) {
      const time = this.epoch + this.nextIndex * this.periodSeconds;
      const index = this.nextIndex;
      this.scheduler.scheduleAt(time, (scheduledTime) => this.onEvent(scheduledTime, index));
      this.nextIndex++;
    }
  }
}
