// Hand-rolled 16-bit PCM WAV encoder. No dependency needed for this - it's
// ~40 lines and is the single best unit-test target in the audio engine
// (byte-exact header layout, sample clamping/scaling).

/** Pure: encodes already-extracted channel data into a WAV Blob. */
export function encodePcm16Wav(channelData: Float32Array<ArrayBuffer>[], sampleRate: number): Blob {
  const numChannels = channelData.length;
  const numFrames = channelData[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channelData[ch][frame]));
      const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, Math.round(intSample), true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Convenience wrapper for the common case of encoding a rendered AudioBuffer. */
export function encodeWavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const channelData: Float32Array<ArrayBuffer>[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }
  return encodePcm16Wav(channelData, buffer.sampleRate);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
