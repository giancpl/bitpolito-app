import * as webpush from "web-push";
import type Database from "better-sqlite3";
import type { Config } from "./config.js";
import type { Moo } from "./moo.js";
export function allowedPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      ([
        "fcm.googleapis.com",
        "android.googleapis.com",
        "updates.push.services.mozilla.com",
      ].includes(u.hostname) ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export type PushSender = (
  subscription: webpush.PushSubscription,
  payload: string,
) => Promise<unknown>;
export function createPushWorker(
  sql: Database.Database,
  moo: Moo,
  config: Config,
  sendOverride?: PushSender,
) {
  const enabled = !!config.pushPublicKey && !!config.pushPrivateKey;
  const send: PushSender =
    sendOverride ||
    ((sub, payload) =>
      webpush.sendNotification(sub, payload, {
        TTL: 60,
        timeout: 5000,
        vapidDetails: {
          subject: config.pushSubject,
          publicKey: config.pushPublicKey,
          privateKey: config.pushPrivateKey,
        },
      }));
  let busy = false;
  let inFlight: Promise<void> | null = null;
  let stopped = false;
  const valid = (job: any) => {
    if (
      !sql
        .prepare(
          "SELECT pubkey FROM users WHERE pubkey=? AND role IN ('member','admin')",
        )
        .get(job.pubkey)
    )
      return false;
    const now = moo.clock();
    if (job.purpose === "test") return Number(job.reference) > now;
    if (job.purpose === "presence") return false; // Retired check-in reminders.
    let r;
    try {
      r = moo.get(job.reference);
    } catch {
      return false;
    }
    if (["ring", "reminder"].includes(job.purpose))
      return (
        r.status === "waiting" &&
        r.expiresAt > now &&
        moo.people().some((p) => p.id === job.pubkey)
      );
    if (job.purpose === "claimed")
      return (
        r.status === "claimed" &&
        r.requesterId === job.pubkey &&
        r.expiresAt > now
      );
    return (
      ["resolved", "cancelled", "expired"].includes(r.status) &&
      r.updatedAt > now - 60
    );
  };
  async function drainJobs() {
    if (busy || stopped) return;
    busy = true;
    try {
      moo.settle();
      const jobs = sql
        .prepare(
          "SELECT * FROM push_jobs WHERE status='pending' AND next_attempt<=? ORDER BY next_attempt LIMIT 30",
        )
        .all(moo.clock()) as any[];
      for (const job of jobs) {
        if (!valid(job)) {
          sql
            .prepare("UPDATE push_jobs SET status='obsolete' WHERE id=?")
            .run(job.id);
          continue;
        }
        if (!enabled) continue;
        const subs = sql
          .prepare(
            "SELECT p.* FROM push_subscriptions p JOIN sessions s ON s.token=p.session_hash JOIN users u ON u.pubkey=p.pubkey WHERE p.pubkey=? AND s.pubkey=p.pubkey AND s.expires_at>? AND u.role IN ('member','admin')",
          )
          .all(job.pubkey, moo.clock()) as any[];
        let failed = false;
        for (const sub of subs) {
          if (!valid(job)) break;
          // Recheck revocation/session validity immediately before each send.
          if (
            !sql
              .prepare(
                "SELECT token FROM sessions WHERE token=? AND expires_at>?",
              )
              .get(sub.session_hash, moo.clock())
          )
            continue;
          try {
            await send(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({
                title: "BitPolito · Office",
                body:
                  job.purpose === "test"
                    ? "Your office alerts are ready."
                    : ["ring", "reminder"].includes(job.purpose)
                      ? "Someone is at the office door."
                      : "Your door request has an update.",
                silent: !["ring", "reminder", "test"].includes(job.purpose),
                purpose: job.purpose,
                request: job.reference,
                url:
                  job.purpose === "test"
                    ? "/moo"
                    : `/moo?request=${job.reference}`,
                tag: `moo-${job.reference}`,
              }),
            );
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410)
              sql
                .prepare("DELETE FROM push_subscriptions WHERE id=?")
                .run(sub.id);
            else failed = true;
          }
        }
        sql
          .prepare(
            "UPDATE push_jobs SET status=?,attempts=attempts+1,next_attempt=?,last_error=? WHERE id=?",
          )
          .run(
            failed ? (job.attempts >= 4 ? "failed" : "pending") : "sent",
            moo.clock() + Math.min(60, 5 * 2 ** job.attempts),
            failed ? "Push provider temporarily unavailable" : null,
            job.id,
          );
      }
    } finally {
      busy = false;
    }
  }
  function drain() {
    if (inFlight) return inFlight;
    inFlight = drainJobs().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  async function stop() {
    stopped = true;
    await inFlight;
  }
  return { drain, enabled, stop };
}
