import { isAndroid } from "./native";
export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let installPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
export const getInstallPrompt = () => installPrompt;
export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function clearInstallPrompt() {
  installPrompt = null;
  listeners.forEach((listener) => listener());
}
// Capture this event before settings are opened; browsers may offer it only once.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as InstallPrompt;
  listeners.forEach((listener) => listener());
});
window.addEventListener("appinstalled", clearInstallPrompt);

// Install support runs only in the built application, keeping development
// servers free from service-worker interception and update lifecycle changes.
if (
  !isAndroid && import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  window.isSecureContext
) {
  const register = () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Installation/offline support is optional. The online application still works.
      });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
