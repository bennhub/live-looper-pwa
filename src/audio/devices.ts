// Audio input device enumeration/selection. Device labels only populate
// after the user has granted microphone permission at least once - that's
// a documented browser quirk, not a bug here.

export interface InputDevice {
  deviceId: string;
  label: string;
}

export async function listAudioInputDevices(): Promise<InputDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` }));
}

export function buildAudioConstraints(deviceId: string | null): MediaStreamConstraints {
  return {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  };
}

/**
 * Minimal, maximally-compatible fallback if the preferred constraints above
 * are rejected outright - some browsers/OS versions (iOS Safari has had
 * documented issues here) can refuse the request entirely rather than just
 * ignoring an audio-processing hint they don't support, even though none of
 * these are exact constraints.
 */
export function buildFallbackAudioConstraints(deviceId: string | null): MediaStreamConstraints {
  return {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };
}
