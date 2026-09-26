// Main-thread wrapper around the pcm-recorder-processor AudioWorklet.
// Accumulates the raw PCM chunks it receives and resolves with an exact,
// sample-accurate mono Float32Array once a capture window closes.

export interface CaptureResult {
  samples: Float32Array<ArrayBuffer>;
  startFrame: number;
}

export class RecorderNode {
  private node: AudioWorkletNode | null = null;
  private silentSink: GainNode | null = null;
  private chunks: Float32Array<ArrayBuffer>[] = [];
  private capturing = false;
  private resolveCapture: ((result: CaptureResult) => void) | null = null;
  private expectedStartFrame = 0;
  private readonly audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  async init(source: AudioNode): Promise<void> {
    await this.audioContext.audioWorklet.addModule("/worklets/recorder-processor.js");
    this.node = new AudioWorkletNode(this.audioContext, "pcm-recorder-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    // Some browsers only keep a worklet's process() running while it has a
    // path to destination; route through a silent (gain 0) sink rather than
    // relying on input-only processing semantics.
    this.silentSink = this.audioContext.createGain();
    this.silentSink.gain.value = 0;
    source.connect(this.node);
    this.node.connect(this.silentSink);
    this.silentSink.connect(this.audioContext.destination);

    this.node.port.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "chunk") {
        if (this.capturing) this.chunks.push(msg.samples as Float32Array<ArrayBuffer>);
      } else if (msg.type === "stopped") {
        this.finishCapture();
      }
    };
  }

  /**
   * Arms a capture window. `stopFrame` null means manual stop (Free Loop
   * Mode) via `stopAt()`; otherwise the worklet auto-stops at that frame
   * (Fixed Bar Mode / overdub, which is always exactly one loop cycle).
   */
  arm(startFrame: number, stopFrame: number | null): Promise<CaptureResult> {
    if (!this.node) throw new Error("RecorderNode not initialized");
    this.chunks = [];
    this.capturing = true;
    this.expectedStartFrame = startFrame;
    this.node.port.postMessage({ type: "arm", startFrame, stopFrame });
    return new Promise((resolve) => {
      this.resolveCapture = resolve;
    });
  }

  /** Ends a manual (Free Loop Mode) capture at the given absolute frame. */
  stopAt(frame: number): void {
    this.node?.port.postMessage({ type: "stopAt", frame });
  }

  cancel(): void {
    this.node?.port.postMessage({ type: "cancel" });
    this.capturing = false;
    this.chunks = [];
    this.resolveCapture = null;
  }

  private finishCapture(): void {
    this.capturing = false;
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    const resolve = this.resolveCapture;
    this.resolveCapture = null;
    resolve?.({ samples: merged, startFrame: this.expectedStartFrame });
  }

  dispose(): void {
    this.node?.disconnect();
    this.silentSink?.disconnect();
  }
}
