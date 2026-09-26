// Non-blocking messages (SW update available, mic permission errors, etc).

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** Runs an action, showing a toast instead of an unhandled rejection on failure. */
export function runCatching(
  action: () => Promise<void> | void,
  errorMessage: string | ((err: unknown) => string) = "Something went wrong.",
): void {
  void (async () => {
    try {
      await action();
    } catch (err) {
      console.error(err);
      // Longer dismiss time than the default - these messages (especially
      // the mic-permission ones) carry actual instructions worth reading.
      showToast(typeof errorMessage === "function" ? errorMessage(err) : errorMessage, undefined, 12000);
    }
  })();
}

export function showToast(message: string, action?: ToastAction, autoDismissMs = 6000): void {
  const root = ensureContainer();
  const toast = document.createElement("div");
  toast.className = "toast";
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(text);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      action.onClick();
      toast.remove();
    });
    toast.append(btn);
  }
  root.append(toast);
  if (autoDismissMs > 0) {
    setTimeout(() => toast.remove(), autoDismissMs);
  }
}
