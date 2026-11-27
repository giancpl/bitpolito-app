import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { team } from "../lib/hub";
import { useIdentity } from "../lib/identity";
import { keys } from "../lib/queries";
import { useConfirm, useToast } from "./Feedback";
import { Avatar, Button, Notice } from "./ui";
import type { JoinApplication } from "../../shared/hub-contracts";

/** Pending requests to join, pinned above the admin tabs because they need a decision. */
export function HubApplications() {
  const identity = useIdentity(),
    confirm = useConfirm(),
    toast = useToast(),
    client = useQueryClient();
  const requests = useQuery({
    queryKey: keys.applications,
    queryFn: team.applications,
    refetchInterval: 5000,
  });
  const members = useQuery({ queryKey: keys.members, queryFn: team.members });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");

  async function review(a: JoinApplication, decision: "approve" | "decline") {
    const name = a.name || "this teammate";
    const replace = !!members.data?.some((u) => u.id === a.pubkey && u.role !== "follower");
    const ok = await confirm({
      title:
        decision === "decline"
          ? `Decline ${name}?`
          : replace
            ? `Replace ${name}’s phone?`
            : `Approve ${name}?`,
      description:
        decision === "decline"
          ? "They will need another invitation to request access again."
          : replace
            ? "The previous phone will lose access to future team updates. Data it already received cannot be erased."
            : "This phone will join your encrypted team and receive the current tools catalogue.",
      action:
        decision === "decline"
          ? "Decline request"
          : replace
            ? "Approve & replace phone"
            : "Approve member",
      danger: replace || decision === "decline",
    });
    if (!ok) return;
    setBusy(a.id);
    setError("");
    try {
      await team.reviewApplication(a.id, decision, replace);
      await client.invalidateQueries();
      toast(
        decision === "approve"
          ? `${a.name || "The new member"} can now join the team.`
          : "Request declined.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const pending = requests.data?.filter((a) => a.status === "pending") || [];
  if (!pending.length && !error && !requests.error) return null;
  return (
    <section className="account-card join-applications" aria-label="Requests to join">
      <div className="section-heading">
        <h2>
          <UserPlus size={20} />
          Requests to join
        </h2>
        <span className="pill pill-accent">{pending.length}</span>
      </div>
      {pending.map((a) => (
        <article className="application-row" key={a.id}>
          <Avatar name={a.name} />
          <span>
            <strong>{a.name || "New teammate"}</strong>
            <code className="small muted">
              {a.pubkey.slice(0, 12)}…{a.pubkey.slice(-6)}
            </code>
          </span>
          <div className="button-row">
            <Button
              disabled={!!busy}
              busy={busy === a.id}
              onClick={() => void review(a, "approve")}
            >
              Approve
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => void review(a, "decline")}>
              Decline
            </Button>
          </div>
        </article>
      ))}
      {(error || requests.error) && (
        <Notice>
          {error || requests.error?.message}
          <Button variant="secondary" onClick={identity.open}>
            Unlock identity or reconnect signer
          </Button>
        </Notice>
      )}
    </section>
  );
}
