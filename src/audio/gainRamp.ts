// Smooth gain changes for any live, user-driven control (volume sliders,
// mute toggles, monitor on/off). Setting `AudioParam.value` directly jumps
// the signal instantaneously - harmless for a single one-off change, but a
// volume slider fires many rapid updates while being dragged, and each
// instantaneous jump is a potential click. On some platforms (this surfaced
// on Android + an external audio interface) enough of those in quick
// succession destabilized the live monitor path into audible distortion/
// ringing that only cleared after the AudioContext was recreated.
//
// setTargetAtTime (exponential approach toward the target) is the right tool
// here rather than linearRampToValueAtTime: it doesn't need a fixed end time,
// so calling it again mid-ramp (the next 'input' event during a drag) just
// retargets smoothly instead of conflicting with the ramp already in flight.

const RAMP_TIME_CONSTANT_SECONDS = 0.015;

export function rampGain(param: AudioParam, value: number, audioContext: AudioContext): void {
  const now = audioContext.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, RAMP_TIME_CONSTANT_SECONDS);
}
