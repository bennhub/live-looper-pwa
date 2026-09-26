import type { Layer, LooperState, Settings, TransportState } from "./types";
import { DEFAULT_SETTINGS } from "./types";

type Listener = (state: LooperState) => void;

/** Valid transport transitions, enforced so the UI/engine can't reach a nonsense state. */
const TRANSITIONS: Record<TransportState, TransportState[]> = {
  idle: ["count-in", "recording"],
  "count-in": ["recording", "idle"], // idle = cancelled (Escape)
  recording: ["playing", "idle"], // idle = cancelled before any audio committed
  playing: ["overdubbing", "stopped", "idle"],
  overdubbing: ["playing", "idle"],
  stopped: ["playing", "idle"],
};

function cloneSettings(s: Settings): Settings {
  return { ...s, timeSignature: { ...s.timeSignature } };
}

/**
 * Plain pub-sub state container - no external library. This is a passive
 * holder + notifier; it never touches the Web Audio API itself. AudioEngine
 * calls these mutation methods when engine-driven events occur, and the UI
 * only subscribes to re-render.
 */
export class LooperStore {
  private state: LooperState;
  private listeners = new Set<Listener>();

  constructor(initialSettings: Settings = DEFAULT_SETTINGS) {
    this.state = {
      transport: "idle",
      settings: cloneSettings(initialSettings),
      layers: [],
      masterLoopFrames: null,
      redoLayer: null,
    };
  }

  getState(): LooperState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private set(patch: Partial<LooperState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  /** Validated transport transition. Returns false (and warns) if invalid. */
  setTransport(next: TransportState): boolean {
    const allowed = TRANSITIONS[this.state.transport];
    if (!allowed.includes(next)) {
      console.warn(`[LooperStore] invalid transition ${this.state.transport} -> ${next}`);
      return false;
    }
    this.set({ transport: next });
    return true;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.set({
      settings: {
        ...this.state.settings,
        ...patch,
        timeSignature: patch.timeSignature
          ? { ...this.state.settings.timeSignature, ...patch.timeSignature }
          : this.state.settings.timeSignature,
      },
    });
  }

  setMasterLoopFrames(frames: number): void {
    this.set({ masterLoopFrames: frames });
  }

  addLayer(layer: Layer): void {
    // Committing a new layer always clears any pending redo (standard semantics).
    this.set({ layers: [...this.state.layers, layer], redoLayer: null });
  }

  updateLayer(id: string, patch: Partial<Layer>): void {
    this.set({
      layers: this.state.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  }

  removeLayer(id: string): void {
    const layer = this.state.layers.find((l) => l.id === id);
    if (layer?.isBase) {
      console.warn("[LooperStore] refusing to remove the base layer via removeLayer; use clearLoop()");
      return;
    }
    this.set({ layers: this.state.layers.filter((l) => l.id !== id) });
  }

  reorderLayers(fromIndex: number, toIndex: number): void {
    const layers = [...this.state.layers];
    const [moved] = layers.splice(fromIndex, 1);
    if (!moved) return;
    layers.splice(toIndex, 0, moved);
    this.set({ layers: layers.map((l, i) => ({ ...l, order: i })) });
  }

  /** Pops the most recent overdub (never the base layer) onto the redo stack. */
  undoLastLayer(): void {
    const overdubs = this.state.layers.filter((l) => !l.isBase);
    if (overdubs.length === 0) return;
    const last = overdubs[overdubs.length - 1];
    this.set({
      layers: this.state.layers.filter((l) => l.id !== last.id),
      redoLayer: last,
    });
  }

  redoLastLayer(): void {
    if (!this.state.redoLayer) return;
    this.set({ layers: [...this.state.layers, this.state.redoLayer], redoLayer: null });
  }

  clearOverdubs(): void {
    this.set({ layers: this.state.layers.filter((l) => l.isBase), redoLayer: null });
  }

  /** Full reset: removes every layer and returns to idle. Settings are untouched. */
  clearLoop(): void {
    this.state = {
      ...this.state,
      transport: "idle",
      layers: [],
      masterLoopFrames: null,
      redoLayer: null,
    };
    this.notify();
  }

  /**
   * One-shot rehydration from persisted settings (+ optionally layers), single
   * notify. `transport`/`masterLoopFrames` bypass normal transition
   * validation since this runs once at boot, before any live transition -
   * a rehydrated session with layers starts "stopped" (paused, ready for the
   * user's resume gesture), never "playing" (autoplay isn't possible before
   * a user gesture resumes the AudioContext anyway).
   */
  hydrate(patch: {
    settings?: Settings;
    layers?: Layer[];
    transport?: TransportState;
    masterLoopFrames?: number | null;
  }): void {
    this.state = {
      ...this.state,
      settings: patch.settings ? cloneSettings(patch.settings) : this.state.settings,
      layers: patch.layers ?? this.state.layers,
      transport: patch.transport ?? this.state.transport,
      masterLoopFrames: patch.masterLoopFrames !== undefined ? patch.masterLoopFrames : this.state.masterLoopFrames,
    };
    this.notify();
  }
}
