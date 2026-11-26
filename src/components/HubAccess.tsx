import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Hourglass, WifiOff } from "lucide-react";
import { inviteToken, team, type ApplicationStatus } from "../lib/hub";
import { isAndroid } from "../lib/native";
import { useIdentity } from "../lib/identity";
import { keys, useConnection } from "../lib/queries";
import { useConfirm } from "./Feedback";
import { AsyncForm, Button, Field, Notice } from "./ui";

const statusNotice: Partial<Record<ApplicationStatus, string>> = {
  declined: "Your request was declined. Ask an administrator for another invitation.",
  used: "This invitation has already been used. Ask for another personal invitation.",
  expired: "This invitation has expired. Ask an administrator for a new one.",
  revoked: "This invitation was revoked. Ask an administrator for another one.",
};

export function HubAccess({ invite }: { invite: string }) {
  const identity = useIdentity(),
    confirm = useConfirm();
  const [error, setError] = useState(""),
    [token, setToken] = useState(invite),
    [busy, setBusy] = useState(false),
    [editingInvite, setEditingInvite] = useState(false);
  const status = useQuery({
    queryKey: keys.joinStatus,
    queryFn: team.joinStatus,
    enabled: !!identity.user,
    refetchInterval: 3000,
  });
  const waiting = status.data?.status === "pending" && !editingInvite;
  const user = identity.user;

  async function requestAccess(form: FormData) {
    const value = inviteToken(String(form.get("invite")));
    if (isAndroid) {
      const device = await team.deviceReadiness(value);
      if (device.otherInstallations > 0) {
        const replace = await confirm({
          title: "Use this phone for your identity?",
          description:
            "This identity is already set up on another phone or Marmot app. Continuing stops that installation from being added to new groups; it keeps groups it already joined until their administrators remove it. Sign out there first, or use a separate identity to keep both.",
          action: "Use this phone",
          danger: true,
        });
        if (!replace)
          throw Error("Nothing was changed. Use another identity or try again when you’re ready.");
        await team.preparePhone(value);
      }
    }
    if (!user!.name) await team.saveProfile({ name: String(form.get("name")), about: "" });
    await team.join(value);
    setEditingInvite(false);
    await status.refetch();
  }

  async function createTeam() {
    const ok = await confirm({
      title: "Create a new BitPolito team?",
      description:
        "You will be its first administrator. This does not reconnect you to an existing team.",
      action: "Create team",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await team.createTeam();
      await identity.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="member-welcome">
      <img src="/brand/loving-cows-blue.svg" alt="Two BitPolito cows" />
      <span className="eyebrow">BitPolito Hub</span>
      <h1>
        {waiting
          ? "Waiting for approval"
          : user
            ? "Join your team"
            : invite
              ? "You’re invited to BitPolito"
              : "Your team. Connected."}
      </h1>
      <p>
        {waiting
          ? "Your administrator approves your phone from their app. Keep BitPolito open — you’ll be let in automatically."
          : user
            ? "Paste the personal invitation an administrator sent you."
            : "See who’s at the office, reach a teammate at the door and find the team’s tools."}
      </p>

      {!user ? (
        <Button onClick={identity.open}>{invite ? "Accept invitation" : "Get started"}</Button>
      ) : (
        <>
          {status.isPending && <p role="status">Checking your team access…</p>}
          {waiting && (
            <div className="waiting-card" role="status">
              <Hourglass size={20} />
              <span>Request sent. You can keep this screen open.</span>
            </div>
          )}
          {!waiting && !status.isPending && (
            <AsyncForm submitLabel="Request access" onSubmit={requestAccess}>
              {!user.name && (
                <Field label="Your name">
                  <input name="name" required maxLength={60} autoComplete="nickname" />
                </Field>
              )}
              <Field label="Invitation link or code">
                <input
                  name="invite"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="bitpolito://join#invite=…"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              {status.data && statusNotice[status.data.status] && (
                <Notice>{statusNotice[status.data.status]}</Notice>
              )}
            </AsyncForm>
          )}
          {waiting && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingInvite(true);
                setToken("");
              }}
            >
              Use another invitation
            </Button>
          )}
          <div className="button-row">
            <Link className="button ghost" to="/account?view=identity">
              Identity & recovery
            </Link>
            <Button
              variant="ghost"
              onClick={() => void identity.logout().catch((e) => setError((e as Error).message))}
            >
              Sign out
            </Button>
          </div>
          {!waiting && !status.isPending && (
            <details className="bootstrap-help">
              <summary>Setting up a new team?</summary>
              <p className="small muted">
                This creates a separate encrypted team. To join an existing team, use its invitation
                instead.
              </p>
              <Button variant="secondary" busy={busy} onClick={() => void createTeam()}>
                Create a new team
              </Button>
            </details>
          )}
        </>
      )}
      {error && <Notice>{error}</Notice>}
    </section>
  );
}

/** Stays out of the way while connected; explains itself only when updates may be delayed. */
export function ConnectionStatus() {
  const status = useConnection();
  const state = status.data?.state;
  if (!state || state === "connected" || state === "simulator") return null;
  return (
    <p className={`hub-connection is-${state}`} role="status">
      <WifiOff size={16} />
      <span>
        {state === "syncing"
          ? "Synchronizing with your team…"
          : "Reconnecting — updates may be delayed"}
        {status.data?.error && <small>{status.data.error}</small>}
      </span>
    </p>
  );
}
