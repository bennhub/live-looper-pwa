import { describe, expect, it, vi } from "vitest";
import { rampGain } from "./gainRamp";

function fakeAudioParam() {
  const setValueSpy = vi.fn();
  return {
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
    // A getter/setter pair on `value` catches a regression back to the
    // instantaneous-jump bug (setting .value directly) even though nothing
    // here calls it on purpose.
    set value(v: number) {
      setValueSpy(v);
    },
    _setValueSpy: setValueSpy,
  };
}

describe("rampGain", () => {
  it("cancels any in-flight automation before retargeting, so rapid slider drags never queue conflicting ramps", () => {
    const param = fakeAudioParam();
    const audioContext = { currentTime: 1.5 } as unknown as AudioContext;

    rampGain(param as unknown as AudioParam, 0.7, audioContext);

    expect(param.cancelScheduledValues).toHaveBeenCalledWith(1.5);
    expect(param.setTargetAtTime).toHaveBeenCalledWith(0.7, 1.5, expect.any(Number));
    expect(param.cancelScheduledValues.mock.invocationCallOrder[0]).toBeLessThan(
      param.setTargetAtTime.mock.invocationCallOrder[0],
    );
  });

  it("never sets .value directly - only ever goes through the smoothing API", () => {
    const param = fakeAudioParam();
    rampGain(param as unknown as AudioParam, 0.3, { currentTime: 0 } as unknown as AudioContext);
    expect(param._setValueSpy).not.toHaveBeenCalled();
  });
});
