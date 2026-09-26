import { registerSW } from "virtual:pwa-register";
import { showToast } from "../ui/toast";

/**
 * registerType is "prompt" (see vite.config.ts) - never silently reload out
 * from under a live recording session. The toast has no auto-dismiss and
 * only reloads when the user explicitly clicks it.
 */
export function initServiceWorker(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      showToast("An update is available.", { label: "Reload", onClick: () => void updateSW(true) }, 0);
    },
    onOfflineReady() {
      showToast("Live Looper is ready to work offline (the app shell — looping still needs a live mic).");
    },
  });
}
