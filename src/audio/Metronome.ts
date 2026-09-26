// Synthesized metronome clicks - no audio asset needed. Wired to its own
// gain node straight to destination, NEVER through the master mix gain, so
// WAV export is guaranteed click-free by construction and volume changes
// here can never affect recorded/exported audio.

export class Metronome {
  private readonly audioContext: AudioContext;
  private readonly gainNode: GainNode;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.gainNode = audioContext.createGain();
    this.gainNode.connect(audioContext.destination);
  }

  setVolume(volume: number): void {
    this.gainNode.gain.value = volume;
  }

  /** Schedules one click at the given audio-clock time. */
  playClick(time: number, accent: boolean): void {
    const osc = this.audioContext.createOscillator();
    const envelope = this.audioContext.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(1, time + 0.001);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(envelope);
    envelope.connect(this.gainNode);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  dispose(): void {
    this.gainNode.disconnect();
  }
}
