// Shared state-shape types for the whole app. Kept dependency-free so both
// the audio engine and the UI can import from here without any cycle risk.

/** The looper's explicit, typed transport state machine. */
export type TransportState =
  | "idle" // no loop recorded yet
  | "count-in" // metronome count-in running, recording not yet started
  | "recording" // capturing the base loop
  | "playing" // loop exists and is playing, nothing being captured
  | "overdubbing" // loop is playing AND a new layer is being captured
  | "stopped"; // loop exists but playback is paused

/** Color token per transport state, used consistently across the UI. */
export const TRANSPORT_COLOR: Record<TransportState, string> = {
  idle: "neutral",
  "count-in": "amber",
  recording: "red",
  playing: "green",
  overdubbing: "orange",
  stopped: "neutral",
};

export type LoopMode = "fixed-bar" | "free";
export type OverdubTrigger = "deferred" | "immediate";

export interface TimeSignature {
  beatsPerBar: number;
  /** Reserved for future compound-meter accenting (e.g. 6/8); unused in v1 math. */
  beatUnit: number;
}

export interface Settings {
  bpm: number;
  timeSignature: TimeSignature;
  bars: number; // used only in fixed-bar mode
  loopMode: LoopMode;
  quantize: boolean; // meaningful only in free mode
  overdubTrigger: OverdubTrigger;
  latencyCompensationMs: number;
  countInEnabled: boolean;
  countInBars: number; // 1 or 2
  keepMetronomeOn: boolean; // continue past count-in, through recording+playback
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0..1
  monitorEnabled: boolean;
  monitorVolume: number; // 0..1
  inputDeviceId: string | null;
  persistAudio: boolean; // opt-in "save loop across reloads"
}

export interface Layer {
  id: string;
  order: number;
  buffer: AudioBuffer;
  gain: number; // 0..1
  muted: boolean;
  isBase: boolean;
  createdAt: number;
}

export interface LooperState {
  transport: TransportState;
  settings: Settings;
  layers: Layer[];
  masterLoopFrames: number | null;
  redoLayer: Layer | null;
}

export const DEFAULT_SETTINGS: Settings = {
  bpm: 100,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 },
  bars: 2,
  loopMode: "fixed-bar",
  quantize: true,
  overdubTrigger: "deferred",
  latencyCompensationMs: 0,
  countInEnabled: true,
  countInBars: 1,
  // Continuous through recording/playback by default - the main-page
  // Metronome toggle is expected to mean "always audible" for most users;
  // "count-in only" is the opt-out, in Settings.
  keepMetronomeOn: true,
  metronomeEnabled: true,
  metronomeVolume: 0.6,
  monitorEnabled: true,
  monitorVolume: 0.8,
  inputDeviceId: null,
  persistAudio: false,
};
