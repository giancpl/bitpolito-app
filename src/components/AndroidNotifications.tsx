import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellOff, BellRing, Volume2 } from "lucide-react";
import { Native, type AlertsStatus } from "../lib/native";
import { team } from "../lib/hub";
import { useIdentity } from "../lib/identity";
import { useConnection } from "../lib/queries";
import { Button, Notice } from "./ui";

function describe(status: AlertsStatus | undefined) {
  if (!status) return { label: "Checking…", tone: "idle" };
  if (!status.permission) return { label: "Notifications need your permission", tone: "warning" };
  if (status.listening) return { label: "Listening for the doorbell", tone: "on" };
  if (status.enabled) return { label: "Ready for your next check-in", tone: "on" };
  return { label: "Office alerts are off", tone: "idle" };
}

export function AndroidNotifications() {
  const { user } = useIdentity();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [hearing, setHearing] = useState(false);
  const key = `bitpolito.office.sound-test.${user?.id}`;
  const [heard, setHeard] = useState(() => Number(localStorage.getItem(key)) || 0);
  const device = useQuery({
    queryKey: ["android-alerts"],
    queryFn: () => Native.alertsStatus(),
    refetchInterval: 5000,
  });
  const connection = useConnection();
  const state = describe(device.data);

  async function run(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      await device.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notifications native-notifications">
      <p className={`alert-state is-${state.tone}`} role="status">
        {state.tone === "on" ? <BellRing size={18} /> : <BellOff size={18} />}
        {state.label}
      </p>

      <section className="alert-setup-step">
        <span className="step-label">Step 1 · Allow office alerts</span>
        <h3>Listen while you’re in</h3>
        <p className="small muted">
          While you’re checked in, a persistent Android notification keeps the encrypted doorbell
          connection open. Leaving stops it.
        </p>
        {!device.data?.enabled || !device.data.permission ? (
          <Button busy={busy} onClick={() => void run(() => Native.enableAlerts())}>
            Enable office alerts
          </Button>
        ) : (
          <Button
            variant="ghost"
            busy={busy}
            onClick={() => void run(() => Native.disableAlerts())}
          >
            Turn office alerts off
          </Button>
        )}
        <Button variant="ghost" onClick={() => void Native.settings()}>
          Open Android settings
        </Button>
      </section>

      <section className="alert-setup-step">
        <span className="step-label">Step 2 · Test the sound</span>
        <h3>A short moo</h3>
        <Button
          variant="secondary"
          busy={busy}
          onClick={() =>
            void run(async () => {
              await Native.testSound();
              setHearing(true);
            })
          }
        >
          <Volume2 size={18} />
          Test cow sound
        </Button>
        {hearing && (
          <div className="hearing-check">
            <p>Did you hear the sound?</p>
            <div className="button-row">
              <Button
                onClick={() => {
                  const at = Date.now();
                  localStorage.setItem(key, String(at));
                  setHeard(at);
                  setHearing(false);
                }}
              >
                Yes, I heard it
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setError("Check volume, Do Not Disturb and Bluetooth, then test again.")
                }
              >
                No, help me
              </Button>
            </div>
          </div>
        )}
        {heard > 0 && (
          <p className="small muted">Last confirmed: {new Date(heard).toLocaleString("en-GB")}</p>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={device.data?.vibration || false}
            onChange={(e) => void run(() => team.alertSettings({ vibration: e.target.checked }))}
          />
          Vibrate with the moo
        </label>
      </section>

      <p className="small muted">
        {connection.data?.state === "connected"
          ? "Connected to your team."
          : "The relay connection may be unavailable."}{" "}
        Android can pause the listener. After restarting or force-stopping the app, reopen it and
        check in again. Volume, silent mode and Do Not Disturb stay under your control.
      </p>
      {(error || device.error) && (
        <Notice>
          {error || device.error?.message}
          <Button variant="ghost" onClick={() => void device.refetch()}>
            Try again
          </Button>
        </Notice>
      )}
    </div>
  );
}
