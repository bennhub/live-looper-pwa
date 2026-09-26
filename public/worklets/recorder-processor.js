// Plain JS AudioWorkletProcessor - deliberately NOT compiled/bundled by Vite.
// Runs on the audio rendering thread and delivers raw Float32 PCM, gated to
// start/stop on exact sample-frame boundaries (using the AudioWorkletGlobalScope
// `currentFrame` global, which advances in lockstep with AudioContext.currentTime).
// This is what makes sample-accurate, zero-gap loop recording possible - unlike
// MediaRecorder's compressed, encoder-padded chunks, or a JS-timer-gated start/stop.
//
// Referenced by a fixed URL from src/audio/recorderNode.ts via
// audioContext.audioWorklet.addModule('/worklets/recorder-processor.js').

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.startFrame = null; // absolute context frame to begin capturing at
    this.stopFrame = null; // absolute context frame to stop at (null = manual stop)

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "arm") {
        // Arms a future (or immediate, if frame <= currentFrame) capture window.
        this.startFrame = msg.startFrame;
        this.stopFrame = typeof msg.stopFrame === "number" ? msg.stopFrame : null;
        this.recording = false;
      } else if (msg.type === "stopAt") {
        // Used for a manual (free-mode) stop: caller supplies the frame to stop at.
        this.stopFrame = msg.frame;
      } else if (msg.type === "cancel") {
        this.recording = false;
        this.startFrame = null;
        this.stopFrame = null;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    const blockSize = channel ? channel.length : 128;
    const blockStart = currentFrame; // AudioWorkletGlobalScope global

    if (this.startFrame !== null && !this.recording && blockStart + blockSize > this.startFrame) {
      this.recording = true;
    }

    if (this.recording && channel) {
      let from = 0;
      let to = blockSize;
      if (this.startFrame !== null && blockStart < this.startFrame) {
        from = this.startFrame - blockStart;
      }
      let stopping = false;
      if (this.stopFrame !== null && blockStart + to > this.stopFrame) {
        to = Math.max(from, this.stopFrame - blockStart);
        stopping = true;
      }
      if (to > from) {
        const copy = new Float32Array(to - from);
        copy.set(channel.subarray(from, to));
        this.port.postMessage({ type: "chunk", samples: copy, frame: blockStart + from }, [copy.buffer]);
      }
      if (stopping) {
        this.recording = false;
        this.port.postMessage({ type: "stopped", frame: this.stopFrame });
        this.startFrame = null;
        this.stopFrame = null;
      }
    }
    return true; // keep the processor alive
  }
}

registerProcessor("pcm-recorder-processor", PcmRecorderProcessor);
