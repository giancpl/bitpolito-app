import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Download, Share, WifiOff } from "lucide-react";
import { Button, Notice } from "./ui";

import {
  clearInstallPrompt,
  getInstallPrompt,
  subscribeInstallPrompt,
} from "../lib/webapp";

export function InstallWebApp() {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const displayMode = matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(
        displayMode.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    const complete = () => {
      setInstalled(true);
    };
    update();
    displayMode.addEventListener("change", update);
    window.addEventListener("appinstalled", complete);
    return () => {
      displayMode.removeEventListener("change", update);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  return (
    <section className="install-webapp" aria-labelledby="install-heading">
      <div className="install-webapp-heading">
        <img src="/icons/icon-192.png" alt="" />
        <div>
          <h3 id="install-heading">BitPolito on your home screen</h3>
          <p>One web app, wherever you’re building.</p>
        </div>
      </div>
      {installed ? (
        <p className="install-status" role="status">
          <Check size={16} /> You’re using the installed web app.
        </p>
      ) : (
        <>
          {prompt && !ios ? (
            <Button
              variant="secondary"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await prompt.prompt();
                  await prompt.userChoice;
                } catch {
                  setError(
                    "The install window couldn’t open. Use your browser’s install or Add to Home Screen option instead.",
                  );
                } finally {
                  clearInstallPrompt();
                  setBusy(false);
                }
              }}
            >
              <Download size={16} /> Install BitPolito
            </Button>
          ) : (
            <p className="small muted">
              {ios ? (
                <>
                  <Share size={14} /> In Safari, open the Share menu, choose{" "}
                  <strong>Add to Home Screen</strong>, and confirm Add.
                </>
              ) : (
                <>
                  Open your browser’s menu and choose{" "}
                  <strong>Install app</strong> or{" "}
                  <strong>Add to Home Screen</strong>, if available. You can
                  also keep using BitPolito in this tab.
                </>
              )}
            </p>
          )}
          {!window.isSecureContext && (
            <p className="small muted">
              Open BitPolito over HTTPS to enable installation on your phone.
            </p>
          )}
        </>
      )}
      {error && <Notice>{error}</Notice>}
    </section>
  );
}

export function OfflineNotice() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online ? null : (
    <Notice>
      <WifiOff size={16} /> You’re offline. Reconnect to load updates or save
      changes.
    </Notice>
  );
}
