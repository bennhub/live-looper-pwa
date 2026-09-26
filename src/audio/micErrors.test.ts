import { describe, expect, it } from "vitest";
import { describeMicError } from "./micErrors";

function domException(name: string): DOMException {
  return new DOMException("mock", name);
}

describe("describeMicError", () => {
  it("gives specific, actionable guidance for a denied permission", () => {
    expect(describeMicError(domException("NotAllowedError"))).toMatch(/permission was denied/i);
    expect(describeMicError(domException("NotAllowedError"))).toMatch(/Settings/);
  });

  it("distinguishes no-device-found from denied-permission", () => {
    expect(describeMicError(domException("NotFoundError"))).toMatch(/no microphone/i);
  });

  it("distinguishes mic-in-use from denied-permission", () => {
    expect(describeMicError(domException("NotReadableError"))).toMatch(/already in use/i);
  });

  it("falls back to a generic message for a non-DOMException error", () => {
    expect(describeMicError(new Error("boom"))).toMatch(/denied or unavailable/i);
  });

  it("falls back to a generic message for an unrecognized DOMException name", () => {
    expect(describeMicError(domException("SomeFutureError"))).toContain("SomeFutureError");
  });
});
