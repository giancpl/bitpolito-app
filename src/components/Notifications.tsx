import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "radix-ui";
import { Bell, Volume2, Check, ChevronDown } from "lucide-react";
import { api, post, remove } from "../lib/api";
import {
  testSound,
  useOfficeSound,
  disableSound,
  vibrationSupported,
  vibrationEnabled,
  setVibration,
} from "../lib/office-sound";
import { useIdentity } from "../lib/identity";
import { useMoo } from "../lib/moo";
import { Button, Notice } from "./ui";
import { InstallWebApp } from "./WebApp";
import type { AppConfig } from "../../shared/contracts";

export function Notifications() {
  const sound = useOfficeSound(),
    client = useQueryClient(),
    { user } = useIdentity();
  const office = useMoo();
  const inside = !!office.data?.presence.some((p) => p.id === user?.id);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [hearing, setHearing] = useState(false),
    [help, setHelp] = useState(false);
  const [vibration, changeVibration] = useState(vibrationEnabled);
  const confirmationKey = `bitpolito.office.sound-test.${user?.id}`;
  const [confirmed, setConfirmed] = useState(
    () => Number(localStorage.getItem(confirmationKey)) || 0,
  );
  const [, refreshDevice] = useState(0);
  const [installed, setInstalled] = useState(false);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<AppConfig>("/config"),
  });
  const status = useQuery({
    queryKey: ["push-status"],
    queryFn: () =>
      api<{ configured: boolean; subscribed: boolean }>("/push/subscriptions"),
  });
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const mode = matchMedia("(display-mode: standalone)");
    const update = () => {
      setInstalled(
        mode.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
      refreshDevice((n) => n + 1);
      void client.invalidateQueries({ queryKey: ["push-status"] });
    };
    const storage = () => changeVibration(vibrationEnabled());
    update();
    mode.addEventListener("change", update);
    window.addEventListener("appinstalled", updateInstalled);
    window.addEventListener("focus", update);
    window.addEventListener("storage", storage);
    function updateInstalled() {
      setInstalled(true);
    }
    return () => {
      mode.removeEventListener("change", update);
      window.removeEventListener("appinstalled", updateInstalled);
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", storage);
    };
  }, [client]);
  const supported =
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator &&
    window.isSecureContext;
  const permission = supported ? Notification.permission : "default";
  const active =
    supported &&
    permission === "granted" &&
    !!status.data?.configured &&
    !!config.data?.pushPublicKey &&
    !!status.data?.subscribed &&
    !config.error &&
    !status.error;
  const pushLabel =
    config.isPending || status.isPending
      ? "Checking…"
      : config.error || status.error
        ? "Check failed"
        : !window.isSecureContext
          ? "HTTPS required"
          : ios && !installed
            ? "Install first"
            : !supported
              ? "Not supported"
              : !status.data?.configured
                ? "Not configured"
                : permission === "denied"
                  ? "Blocked"
                  : active
                    ? "Enabled"
                    : "Off";
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await client.invalidateQueries({ queryKey: ["push-status"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    if (!supported)
      throw Error(
        "Push alerts are not supported here. Keep the app open for in-app alerts.",
      );
    if (!config.data?.pushPublicKey)
      throw Error("Push alerts have not been configured for this server yet.");
    if (
      Notification.permission !== "granted" &&
      (await Notification.requestPermission()) !== "granted"
    )
      throw Error(
        "Notifications are not enabled. You can change this in browser settings.",
      );
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration)
      throw Error(
        "Install support is available in the built app. Reload the production app and try again.",
      );
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const encoded = config.data.pushPublicKey
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
    }
    await post("/push/subscriptions", subscription.toJSON());
    setMessage(
      "Alerts enabled on this device. Send a test notification below.",
    );
  }
  return (
    <section className="notifications">
      <p className="small muted alerts-intro">
        A quick setup for this phone. Checking in never depends on enabling
        alerts.
      </p>
      <details
        className="alert-step install-step"
        open={ios && !installed ? true : undefined}
      >
        <summary>
          <span className="step-number">1</span>
          <strong>Install</strong>
          <span className="step-state">
            {installed ? "Installed" : ios ? "For iPhone push" : "Recommended"}
          </span>
          <ChevronDown size={18} />
        </summary>
        <InstallWebApp />
      </details>
      <section className="alert-step" aria-labelledby="push-heading">
        <div className="alert-step-heading">
          <span className="step-number">2</span>
          <h3 id="push-heading">Enable alerts</h3>
          <span className="step-state">{pushLabel}</span>
        </div>
        <p className="alert-channel-label">
          <Bell size={16} /> When the app is closed
        </p>
        <p className="small muted">
          {active
            ? "Alerts are enabled on this device."
            : "Alerts only while the app is open."}
        </p>
        {ios && !installed && (
          <p className="small muted">
            On iPhone, add BitPolito to your Home Screen in Safari, then enable
            notifications from the installed app.
          </p>
        )}
        {status.data && !status.data.configured && (
          <p className="small muted">
            Background alerts aren’t available here yet. Cow sound still works
            with the app open.
          </p>
        )}
        {permission === "denied" && (
          <p className="small muted">
            Allow notifications in your browser or app settings, then return
            here. Check that BitPolito is allowed in your Focus or Do Not
            Disturb settings too.
          </p>
        )}
        {(status.error || config.error) && (
          <Notice>
            Couldn’t check background alerts.{" "}
            <Button
              variant="ghost"
              onClick={() => {
                void status.refetch();
                void config.refetch();
              }}
            >
              Try again
            </Button>
          </Notice>
        )}
        <div className="button-row">
          {active ? (
            <Button
              variant="ghost"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await remove("/push/subscriptions");
                  const registration =
                    await navigator.serviceWorker.getRegistration();
                  await (
                    await registration?.pushManager.getSubscription()
                  )?.unsubscribe();
                })
              }
            >
              Disable alerts
            </Button>
          ) : (
            <Button
              variant="secondary"
              busy={busy}
              disabled={
                !supported ||
                !status.data?.configured ||
                (ios && !installed) ||
                !!config.error ||
                !!status.error
              }
              onClick={() => void run(enable)}
            >
              <Bell size={18} />
              Enable office alerts
            </Button>
          )}
        </div>
      </section>
      <section className="alert-step" aria-labelledby="sound-test-heading">
        <div className="alert-step-heading">
          <span className="step-number">3</span>
          <h3 id="sound-test-heading">Test</h3>
        </div>
        <p className="alert-channel-label">
          <Volume2 size={16} /> While the app is open
        </p>
        <p className="small muted">
          {sound === "ready"
            ? "Cow sound ready while this page is visible."
            : sound === "locked"
              ? "Tap Reactivate cow sound after reloading or when your browser pauses audio."
              : "Cow sound is off."}
        </p>
        <div className="button-row">
          <Button
            variant="secondary"
            busy={busy}
            onClick={() =>
              void run(async () => {
                setHearing(false);
                setHelp(false);
                if (!(await testSound(inside)))
                  throw Error(
                    "Tap again to enable the cow sound. Check your device volume too.",
                  );
                setHearing(true);
              })
            }
          >
            <Volume2 size={18} />
            {sound === "locked"
              ? "Reactivate cow sound"
              : sound === "ready"
                ? "Test cow sound"
                : "Enable cow sound"}
          </Button>
          {sound !== "off" && (
            <Button
              variant="ghost"
              onClick={() => {
                disableSound();
                setHearing(false);
              }}
            >
              Mute cow sound
            </Button>
          )}
        </div>
        {vibrationSupported() && (
          <label className="vibration-setting">
            <span>
              <strong>Vibrate with office alerts</strong>
              <small>Only while you’re in and the app is visible.</small>
            </span>
            <Switch.Root
              className="switch-control"
              checked={vibration}
              onCheckedChange={(value) => {
                setVibration(value);
                changeVibration(value);
              }}
              aria-label="Vibrate with office alerts"
            >
              <Switch.Thumb className="switch-thumb" />
            </Switch.Root>
          </label>
        )}
        {hearing && (
          <fieldset className="hearing-check">
            <legend>Did you hear the sound?</legend>
            <div className="button-row">
              <Button
                variant="secondary"
                onClick={() => {
                  const now = Date.now();
                  localStorage.setItem(confirmationKey, String(now));
                  setConfirmed(now);
                  setHearing(false);
                  setHelp(false);
                }}
              >
                Yes, I heard it
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setHearing(false);
                  setHelp(true);
                }}
              >
                No, help me
              </Button>
            </div>
          </fieldset>
        )}
        {help && (
          <Notice>
            Turn up your phone’s media volume and check whether sound is going
            to Bluetooth headphones. Try again with the app visible. For
            closed-app alerts, check notification volume, silent mode and Focus.
            The app cannot change these settings.
          </Notice>
        )}
        {confirmed > 0 && (
          <p className="small muted hearing-confirmed">
            <Check size={16} />
            Last heard by you:{" "}
            {new Date(confirmed).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . This is your test history, not a guarantee of future sound.
          </p>
        )}
        {active && (
          <Button
            variant="secondary"
            busy={busy}
            onClick={() =>
              void run(async () => {
                await post("/push/test");
                setMessage(
                  "Test alert requested. Delivery depends on your browser and notification settings.",
                );
              })
            }
          >
            Test notification
          </Button>
        )}
      </section>
      <p className="alert-limits small">
        Only members marked in the office receive door alerts. Closed-app alerts
        use your device’s notification sound. Low volume, silent mode or Focus
        may prevent you hearing an alert; BitPolito cannot override them.
      </p>
      <a
        href="/audio/ATTRIBUTION.txt"
        target="_blank"
        rel="noreferrer"
        className="text-button small"
      >
        Cow recording & license
      </a>
      {message && (
        <p className="success small" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      {error && <Notice>{error}</Notice>}
    </section>
  );
}
