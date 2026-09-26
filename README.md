# Live Looper

A live audio looper PWA for guitar and other instruments, built with the
Web Audio API. Record a loop, it plays back with zero gap, and you stack
overdubs on top — with continuous low-latency live monitoring, a metronome
with count-in, Fixed Bar or Free Loop recording modes, undo/redo, and WAV
export. Installable, works offline (the app shell — looping itself always
needs a live microphone).

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build (type-checks, then builds)
npm run preview   # preview the production build
npm test          # run the unit tests (pure audio-math logic)
```

Open the dev server URL in Chrome, Edge, Firefox, or Safari (iOS 16.4+).
Microphone access is requested the first time you press Record, not at
page load. For a real instrument, an external audio interface is strongly
recommended — see the "Expected latency & limitations" note in Settings.

## Architecture

- **`src/audio/`** — the Web Audio engine: a hand-written `AudioWorklet`
  captures raw PCM (not `MediaRecorder`, which can't guarantee zero-gap,
  drift-free loops); a lookahead `Scheduler` ("A Tale of Two Clocks"
  pattern) drives sample-accurate loop restarts and metronome clicks;
  `AudioEngine` is the facade orchestrating record/overdub/play/stop.
- **`src/state/`** — a small framework-free pub-sub store holding the
  typed transport state machine, settings, and layers.
- **`src/persistence/`** — IndexedDB. Settings always persist; recorded
  audio only persists if you opt into "Save loop across reloads".
- **`src/ui/`** — plain DOM, no framework, dark hardware-pedal aesthetic.
- **`src/support/capabilities.ts`** — feature detection with a clear
  message on unsupported browsers instead of a silent failure.

See `src/audio/quantize.ts`, `src/audio/latency.ts`, `src/audio/TapTempo.ts`,
and `src/audio/wavEncoder.ts` for the pure, unit-tested math.

## Known v1 limitations

- Mono only.
- Changing BPM after a loop exists doesn't resize it — only affects
  metronome speed going forward (like a real pedal).
- No compound-meter (6/8-style) click accenting yet, though the bar/beat
  math is time-signature-agnostic.
- Background/lock-screen audio throttling on mobile browsers isn't worked
  around.
