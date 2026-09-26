// Feature detection so unsupported browsers get a clear message instead of a
// silent failure or a confusing half-broken UI.

export interface CapabilityCheck {
  supported: boolean;
  missing: string[];
}

export function checkCapabilities(): CapabilityCheck {
  const missing: string[] = [];

  if (typeof window.AudioContext === "undefined" && !("webkitAudioContext" in window)) {
    missing.push("Web Audio API");
  }
  if (typeof AudioWorkletNode === "undefined") {
    missing.push("AudioWorklet");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    missing.push("Microphone access (getUserMedia)");
  }
  if (typeof indexedDB === "undefined" && typeof localStorage === "undefined") {
    missing.push("Local storage");
  }

  return { supported: missing.length === 0, missing };
}
