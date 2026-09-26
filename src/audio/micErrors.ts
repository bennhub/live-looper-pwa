// Turns a getUserMedia rejection into a specific, actionable message instead
// of a generic "denied or unavailable" - the DOMException name tells us
// (and the user) exactly what actually happened.
export function describeMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : undefined;
  switch (name) {
    case "NotAllowedError":
      return (
        "Microphone permission was denied. On iPhone: Settings > Safari > Microphone " +
        "(or Settings > [this site] under Websites in Safari settings), allow it, then reload the page."
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found. Check that an input device is connected.";
    case "NotReadableError":
    case "TrackStartError":
      return "The microphone is already in use by another app. Close other apps using it and try again.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "The selected microphone doesn't support the requested settings.";
    case "SecurityError":
      return "Microphone access requires HTTPS.";
    case "AbortError":
      return "Microphone access was interrupted. Try again.";
    default:
      if (name) return `Microphone error (${name}). Check permissions and try again.`;
      return "Microphone access was denied or unavailable. Check permissions and try again.";
  }
}
