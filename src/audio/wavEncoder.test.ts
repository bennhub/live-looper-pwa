import { describe, expect, it } from "vitest";
import { encodePcm16Wav } from "./wavEncoder";

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe("encodePcm16Wav", () => {
  it("writes a byte-exact RIFF/WAVE header for mono audio", async () => {
    const channelData = [new Float32Array([0, 0.5, -0.5, 1, -1])];
    const sampleRate = 44100;
    const blob = encodePcm16Wav(channelData, sampleRate);

    expect(blob.type).toBe("audio/wav");
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readAscii(view, 36, 4)).toBe("data");

    const dataSize = 5 * 2; // 5 frames * 2 bytes/sample (mono, 16-bit)
    expect(view.getUint32(40, true)).toBe(dataSize);
    expect(view.getUint32(4, true)).toBe(36 + dataSize);
    expect(buffer.byteLength).toBe(44 + dataSize);
  });

  it("clamps and scales samples correctly, including full-scale +/-1", () => {
    const channelData = [new Float32Array([1, -1, 0, 2, -2])]; // 2/-2 exercise clamping
    const blob = encodePcm16Wav(channelData, 48000);
    return blob.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) samples.push(view.getInt16(44 + i * 2, true));
      expect(samples[0]).toBe(0x7fff); // +1 -> max positive
      expect(samples[1]).toBe(-0x8000); // -1 -> max negative
      expect(samples[2]).toBe(0);
      expect(samples[3]).toBe(0x7fff); // clamped from 2
      expect(samples[4]).toBe(-0x8000); // clamped from -2
    });
  });

  it("interleaves multi-channel data correctly", async () => {
    const left = new Float32Array([1, 0]);
    const right = new Float32Array([-1, 0]);
    const blob = encodePcm16Wav([left, right], 48000);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    expect(view.getUint16(22, true)).toBe(2); // stereo
    // frame 0: L then R
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
    // frame 1: L then R
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(0);
  });
});
