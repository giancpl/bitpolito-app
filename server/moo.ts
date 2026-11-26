import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { fail } from "./errors.js";
import type { MooRequest, MooState, Presence } from "../shared/contracts.js";
// Find the next local date boundary rather than adding 24 hours: Rome days
// can contain 23 or 25 hours at a daylight-saving transition.
export function nextRomeMidnight(now: number): number {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = format.format(now * 1000);
  let low = Math.floor(now),
    high = low + 26 * 3600;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (format.format(middle * 1000) === today) low = middle;
    else high = middle;
  }
  return high;
}
export class Moo {
  readonly changes = new EventEmitter();
  constructor(
    readonly sql: Database.Database,
    readonly clock: () => number,
  ) {
    this.changes.setMaxListeners(0);
  }
  changed() {
    this.changes.emit("change");
  }
  queue(pubkey: string, purpose: string, reference: string, suffix = "") {
    this.sql
      .prepare(
        "INSERT OR IGNORE INTO push_jobs (id,pubkey,purpose,reference,next_attempt) VALUES (?,?,?,?,?)",
      )
      .run(
        `${purpose}:${reference}:${pubkey}:${suffix}`,
        pubkey,
        purpose,
        reference,
        this.clock(),
      );
  }
  notifyPresent(request: string, purpose: string, suffix = "") {
    const row = this.sql
      .prepare("SELECT requester FROM moo_requests WHERE id=?")
      .get(request) as { requester: string };
    for (const person of this.people())
      if (person.id !== row.requester)
        this.queue(person.id, purpose, request, suffix);
  }
  people(): Presence[] {
    return this.sql
      .prepare(
        "SELECT p.pubkey AS id,u.name,p.expires_at AS expiresAt FROM presence p JOIN users u ON u.pubkey=p.pubkey WHERE p.expires_at>? AND u.role IN ('member','admin') ORDER BY u.name",
      )
      .all(this.clock()) as Presence[];
  }
  get(id: string): MooRequest {
    const row = this.sql
      .prepare(
        `SELECT r.id,r.requester AS requesterId,u.name AS requesterName,r.status,r.created_at AS createdAt,r.expires_at AS expiresAt,r.claimed_by AS claimedBy,c.name AS claimerName,r.claim_until AS claimUntil,r.resolved_reason AS resolvedReason,r.updated_at AS updatedAt FROM moo_requests r JOIN users u ON u.pubkey=r.requester LEFT JOIN users c ON c.pubkey=r.claimed_by WHERE r.id=?`,
      )
      .get(id) as MooRequest | undefined;
    return row || fail(404, "Request not found");
  }
  settle() {
    const now = this.clock();
    let changed = false;
    this.sql.transaction(() => {
      changed = !!this.sql
        .prepare(
          "DELETE FROM presence WHERE expires_at<=? OR pubkey IN (SELECT pubkey FROM users WHERE role NOT IN ('member','admin'))",
        )
        .run(now).changes;
      const claims = this.sql
        .prepare(
          "SELECT id FROM moo_requests WHERE status='claimed' AND (claim_until<=? OR claimed_by NOT IN (SELECT pubkey FROM presence WHERE expires_at>?))",
        )
        .all(now, now) as { id: string }[];
      for (const { id } of claims) {
        const r = this.get(id);
        this.sql
          .prepare(
            "UPDATE moo_requests SET status=?,claimed_by=NULL,claim_until=NULL,updated_at=? WHERE id=?",
          )
          .run(r.expiresAt > now ? "waiting" : "expired", now, id);
        changed = true;
        if (r.expiresAt > now) this.notifyPresent(id, "ring", `release-${now}`);
        else this.queue(r.requesterId, "expired", id);
      }
      const expired = this.sql
        .prepare(
          "SELECT id,requester FROM moo_requests WHERE status IN ('waiting','claimed') AND expires_at<=?",
        )
        .all(now) as { id: string; requester: string }[];
      for (const r of expired) {
        this.sql
          .prepare(
            "UPDATE moo_requests SET status='expired',claimed_by=NULL,claim_until=NULL,updated_at=? WHERE id=?",
          )
          .run(now, r.id);
        this.queue(r.requester, "expired", r.id);
        changed = true;
      }
      const rings = this.sql
        .prepare(
          "SELECT id FROM moo_requests WHERE status='waiting' AND reminded=0 AND created_at<=?",
        )
        .all(now - 60) as { id: string }[];
      for (const r of rings) {
        this.sql
          .prepare("UPDATE moo_requests SET reminded=1 WHERE id=?")
          .run(r.id);
        this.notifyPresent(r.id, "reminder");
      }
    })();
    if (changed) this.changed();
  }
  state(user: string): MooState {
    this.settle();
    const now = this.clock();
    const own = this.sql
      .prepare(
        "SELECT id FROM moo_requests WHERE requester=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(user) as { id: string } | undefined;
    const present = this.people();
    const incoming = present.some((p) => p.id === user)
      ? (
          this.sql
            .prepare(
              "SELECT id FROM moo_requests WHERE requester!=? AND status IN ('waiting','claimed') ORDER BY created_at",
            )
            .all(user) as { id: string }[]
        ).map((r) => this.get(r.id))
      : [];
    return {
      office: "BitPolito Office",
      serverTime: now,
      presence: present,
      own: own ? this.get(own.id) : null,
      incoming,
    };
  }
  presence(user: string, action: string) {
    if (action === "extend")
      fail(
        410,
        "Presence extensions have been retired. Check in to stay until midnight, or choose I’m leaving.",
      );
    if (!["arrive", "leave"].includes(action))
      fail(400, "Unknown presence action");
    this.settle();
    const now = this.clock();
    if (action === "leave")
      this.sql.prepare("DELETE FROM presence WHERE pubkey=?").run(user);
    else {
      if (
        this.sql
          .prepare(
            "SELECT id FROM moo_requests WHERE requester=? AND status IN ('waiting','claimed')",
          )
          .get(user)
      )
        fail(409, "Finish or cancel your door request before checking in.");
      this.sql
        .prepare(
          "INSERT INTO presence (pubkey,expires_at,reminded) VALUES (?,?,0) ON CONFLICT(pubkey) DO UPDATE SET expires_at=excluded.expires_at,reminded=0",
        )
        .run(user, nextRomeMidnight(now));
    }
    this.settle();
    this.changed();
    return this.state(user);
  }
  ring(user: string, key: string) {
    this.settle();
    const now = this.clock();
    const result = this.sql.transaction(() => {
      const duplicate = this.sql
        .prepare(
          "SELECT id FROM moo_requests WHERE requester=? AND operation_key=?",
        )
        .get(user, key) as { id: string } | undefined;
      if (duplicate) return this.get(duplicate.id);
      const active = this.sql
        .prepare(
          "SELECT id FROM moo_requests WHERE requester=? AND status IN ('waiting','claimed')",
        )
        .get(user) as { id: string } | undefined;
      if (active) return this.get(active.id);
      if (this.people().some((p) => p.id === user))
        fail(
          409,
          "You are marked as in the office. Choose “I’m leaving” before ringing.",
        );
      if (!this.people().length)
        fail(409, "Nobody is marked as in the office.");
      const last = this.sql
        .prepare(
          "SELECT created_at FROM moo_requests WHERE requester=? ORDER BY created_at DESC LIMIT 1",
        )
        .get(user) as { created_at: number } | undefined;
      if (last && last.created_at > now - 60)
        fail(429, "Please wait 60 seconds between door requests.");
      const id = randomUUID();
      this.sql
        .prepare(
          "INSERT INTO moo_requests (id,requester,operation_key,status,created_at,expires_at,updated_at) VALUES (?,?,?,'waiting',?,?,?)",
        )
        .run(id, user, key, now, now + 180, now);
      this.notifyPresent(id, "ring");
      return this.get(id);
    })();
    this.changed();
    return result;
  }
  action(user: string, id: string, action: string) {
    if (action === "opened")
      fail(
        410,
        "Opening confirmation has been retired. Only the arriving member confirms I’m inside.",
      );
    if (!["claim", "release", "inside", "cancel"].includes(action))
      fail(400, "Unknown request action");
    this.settle();
    const now = this.clock();
    const result = this.sql.transaction(() => {
      const r = this.get(id);
      const owner = r.requesterId === user;
      if (action === "claim") {
        if (owner || !this.people().some((p) => p.id === user))
          fail(403, "Only a member currently in the office can answer.");
        if (r.status === "claimed" && r.claimedBy === user) return r;
        if (r.status !== "waiting")
          fail(409, "Someone else is handling this request, or it has ended.");
        const until = Math.min(now + 90, r.createdAt + 300);
        this.sql
          .prepare(
            "UPDATE moo_requests SET status='claimed',claimed_by=?,claim_until=?,expires_at=?,updated_at=? WHERE id=? AND status='waiting'",
          )
          .run(user, until, Math.max(r.expiresAt, until), now, id);
        this.queue(r.requesterId, "claimed", id, String(now));
      } else if (action === "release") {
        if (r.status === "waiting") {
          if (!this.people().some((p) => p.id === user))
            fail(
              403,
              "Only a member currently in the office can view incoming requests.",
            );
          return r;
        }
        if (r.status !== "claimed" || r.claimedBy !== user)
          fail(403, "Only the person handling this request can release it.");
        this.sql
          .prepare(
            "UPDATE moo_requests SET status='waiting',claimed_by=NULL,claim_until=NULL,updated_at=? WHERE id=?",
          )
          .run(now, id);
        this.notifyPresent(id, "ring", `release-${now}`);
      } else {
        if ((action === "inside" || action === "cancel") && !owner)
          fail(403, "Only the requester can do this.");
        if (!["waiting", "claimed"].includes(r.status)) {
          if (
            (action === "cancel" && r.status === "cancelled") ||
            (r.status === "resolved" && r.resolvedReason === action)
          )
            return r;
          fail(409, "This request has already ended.");
        }
        this.sql
          .prepare(
            "UPDATE moo_requests SET status=?,resolved_reason=?,updated_at=? WHERE id=?",
          )
          .run(
            action === "cancel" ? "cancelled" : "resolved",
            action === "cancel" ? null : action,
            now,
            id,
          );
        if (action === "inside") {
          this.sql
            .prepare(
              "INSERT INTO presence (pubkey,expires_at,reminded) VALUES (?,?,0) ON CONFLICT(pubkey) DO UPDATE SET expires_at=excluded.expires_at,reminded=0",
            )
            .run(user, nextRomeMidnight(now));
        }
        this.queue(r.requesterId, "ended", id);
        if (r.claimedBy) this.queue(r.claimedBy, "ended", id);
      }
      return this.get(id);
    })();
    this.changed();
    return result;
  }
  revoke(user: string) {
    this.sql.prepare("DELETE FROM presence WHERE pubkey=?").run(user);
    this.sql
      .prepare(
        "UPDATE moo_requests SET status='cancelled',updated_at=? WHERE requester=? AND status IN ('waiting','claimed')",
      )
      .run(this.clock(), user);
    this.settle();
    this.changed();
  }
}
