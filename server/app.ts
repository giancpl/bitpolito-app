import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import { verifyEvent } from "nostr-tools/pure";
import {
  authSchema,
  inviteTokenSchema,
  profileSchema,
  pubkeySchema,
  presenceSchema,
  resourceSchema,
  ringSchema,
  requestActionSchema,
  signedEventSchema,
  pushSchema,
  type User,
} from "../shared/contracts.js";
import { catalogue } from "../shared/catalogue.js";
import { openDatabase } from "./db.js";
import { readConfig, isLoopback, type Config } from "./config.js";
import { fail } from "./errors.js";
import { Moo } from "./moo.js";
import {
  allowedPushEndpoint,
  createPushWorker,
  type PushSender,
} from "./push.js";
import { androidSupport, type AndroidSender } from "./android.js";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const params = (r: FastifyRequest) => r.params as Record<string, string>;
declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
    sessionHash: string | null;
    rawBody: string;
  }
}
export async function createApp(
  overrides: Partial<Config> = {},
  options: {
    clock?: () => number;
    pushSender?: PushSender;
    workers?: boolean;
    androidPushSender?: AndroidSender;
  } = {},
) {
  const config = readConfig(overrides),
    store = openDatabase(config.dataDir),
    sql = store.sqlite;
  const clock = options.clock || (() => Math.floor(Date.now() / 1000));
  const moo = new Moo(sql, clock),
    push = createPushWorker(sql, moo, config, options.pushSender);
  const app = Fastify({
    logger:
      process.env.NODE_ENV !== "test"
        ? {
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
            ],
          }
        : false,
    bodyLimit: 65536,
    trustProxy: config.trustProxy
      ? (_address: string, hop: number) => hop === 0
      : false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 240,
    timeWindow: "1 minute",
    hook: "preHandler",
    allowList: (req) =>
      !req.url.startsWith("/api/") || req.url === "/api/health",
    keyGenerator: (req) => req.user?.id || req.ip,
  });
  app.decorateRequest("user", null);
  app.decorateRequest("sessionHash", null);
  app.decorateRequest("rawBody", "");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        req.rawBody = String(body);
        done(null, JSON.parse(String(body)));
      } catch {
        done(Object.assign(Error("Invalid JSON"), { statusCode: 400 }));
      }
    },
  );
  const sessionUser = (token: string) =>
    sql
      .prepare(
        "SELECT u.pubkey AS id,u.name,u.about,u.role FROM sessions s JOIN users u ON u.pubkey=s.pubkey WHERE s.token=? AND s.expires_at>? AND length(u.pubkey)=64",
      )
      .get(token, clock()) as User | undefined;
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' " +
          config.relays.map((r) => new URL(r).origin).join(" ") +
          "; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    const expected = new URL(config.origin).hostname;
    if (req.hostname !== expected && !isLoopback(req.hostname))
      fail(403, "Unexpected request host");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== config.origin)
        fail(403, "Request origin is not allowed");
      if (req.headers["x-bitpolito-request"] !== "1")
        fail(403, "Missing request verification header");
    }
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    if (bearer && req.cookies.bp_session) fail(400, "Mixed session credentials are not allowed");
    const token = bearer || req.cookies.bp_session;
    if (token) {
      req.sessionHash = hash(token);
      const allowed = sql.prepare("SELECT client FROM sessions WHERE token=?").get(req.sessionHash) as {client:string}|undefined;
      req.user = allowed?.client === (bearer ? "android" : "web") ? sessionUser(req.sessionHash) || null : null;
    }
  });
  app.addHook("onSend", async (req, reply, payload) => {
    if (
      ["/sw.js", "/manifest.webmanifest", "/offline.html"].includes(
        req.url.split("?")[0],
      )
    )
      reply.header("Cache-Control", "no-cache");
    return payload;
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
          .join("; "),
      });
    const e = error as Error & { statusCode?: number };
    const status = e.statusCode || 500;
    if (status >= 500) app.log.error({ err: e }, "Request failed");
    return reply.code(status).send({
      error:
        status >= 500 ? "Something went wrong. Please try again." : e.message,
    });
  });
  const auth = (req: FastifyRequest) =>
    req.user || fail(401, "Sign in to continue");
  const member = (req: FastifyRequest) => {
    const user = auth(req);
    if (user.role === "follower") fail(403, "Member access required");
    return user;
  };
  const admin = (req: FastifyRequest) => {
    const user = member(req);
    if (user.role !== "admin") fail(403, "Administrator access required");
    return user;
  };
  const audit = (user: User, action: string, target: string) =>
    sql
      .prepare(
        "INSERT INTO activity (pubkey,action,target,created_at) VALUES (?,?,?,?)",
      )
      .run(user.id, action, target, clock());
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: config.cookieSecure,
  };
  // Seed a separate curated collection once, without converting old project records.
  sql.transaction(() => {
    for (const item of catalogue)
      sql
        .prepare(
          "INSERT OR IGNORE INTO resources (id,title,description,type,category,url,status,icon,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          item.id,
          item.title,
          item.description,
          ["mining-game", "silent-payments", "testing"].includes(item.id)
            ? "tool"
            : "resource",
          item.tag,
          item.url,
          "active",
          item.icon,
          clock(),
        );
  })();
  const android = androidSupport(app, sql, moo, config, options.androidPushSender);
  app.get("/api/health", async () => ({
    status: "ok",
    database: sql.prepare("SELECT 1 AS ok").get(),
    pushConfigured: push.enabled,
  }));
  app.get("/api/config", async () => ({
    timezone: "Europe/Rome",
    relays: config.relays,
    pushPublicKey: push.enabled ? config.pushPublicKey : null,
  }));
  app.get("/api/me", async (req) => ({ user: req.user }));
  app.get(
    "/api/auth/challenge",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (_req, reply) => {
      sql.prepare("DELETE FROM challenges WHERE expires_at<=?").run(clock());
      const challenge = randomBytes(32).toString("hex");
      sql
        .prepare("INSERT INTO challenges (nonce,expires_at) VALUES (?,?)")
        .run(challenge, clock() + 60);
      reply.setCookie("bp_challenge", challenge, {
        ...cookieOptions,
        maxAge: 60,
      });
      return { challenge };
    },
  );
  app.post(
    "/api/auth/session",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = authSchema.parse(req.body);
      if (req.cookies.bp_challenge !== body.challenge)
        fail(
          401,
          "Authentication challenge belongs to another browser or expired",
        );
      let event: z.infer<typeof signedEventSchema>;
      try {
        const authorization = req.headers.authorization || "";
        if (!authorization.startsWith("Nostr ")) throw Error();
        event = signedEventSchema.parse(
          JSON.parse(Buffer.from(authorization.slice(6), "base64").toString()),
        );
      } catch {
        return fail(401, "A valid Nostr signature is required");
      }
      const tag = (name: string) => event.tags.filter((t) => t[0] === name);
      if (
        !verifyEvent(event) ||
        event.kind !== 27235 ||
        event.content !== "" ||
        Math.abs(event.created_at - clock()) > 60 ||
        tag("u").length !== 1 ||
        tag("u")[0][1] !== `${config.origin}/api/auth/session` ||
        tag("method").length !== 1 ||
        tag("method")[0][1] !== "POST" ||
        tag("payload").length !== 1 ||
        tag("payload")[0][1] !== hash(req.rawBody)
      )
        fail(
          401,
          "Authentication signature, timestamp or request binding is invalid",
        );
      const token = randomBytes(32).toString("hex");
      sql.transaction(() => {
        if (
          !sql
            .prepare("DELETE FROM challenges WHERE nonce=? AND client='web' AND expires_at>?")
            .run(body.challenge, clock()).changes
        )
          fail(401, "Challenge expired or already used");
        sql
          .prepare(
            "INSERT OR IGNORE INTO users (pubkey,name,created_at) VALUES (?,?,?)",
          )
          .run(event.pubkey, body.name || "", clock());
        if (body.name)
          sql
            .prepare("UPDATE users SET name=? WHERE pubkey=?")
            .run(body.name, event.pubkey);
        if (req.sessionHash) {
          sql
            .prepare("DELETE FROM sessions WHERE token=?")
            .run(req.sessionHash);
          sql
            .prepare("DELETE FROM push_subscriptions WHERE session_hash=?")
            .run(req.sessionHash);
        }
        sql
          .prepare(
            "INSERT INTO sessions (token,pubkey,expires_at) VALUES (?,?,?)",
          )
          .run(hash(token), event.pubkey, clock() + 7 * 86400);
      })();
      reply.clearCookie("bp_challenge", { path: "/" });
      reply.setCookie("bp_session", token, {
        ...cookieOptions,
        maxAge: 7 * 86400,
      });
      return { user: sessionUser(hash(token)) };
    },
  );
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.sessionHash) {
      sql.prepare("DELETE FROM sessions WHERE token=?").run(req.sessionHash);
      sql
        .prepare("DELETE FROM push_subscriptions WHERE session_hash=?")
        .run(req.sessionHash);
    }
    reply.clearCookie("bp_session", { path: "/" });
    moo.changed();
    return { ok: true };
  });
  app.put("/api/profile", async (req) => {
    const user = auth(req),
      body = profileSchema.parse(req.body);
    sql
      .prepare("UPDATE users SET name=?,about=? WHERE pubkey=?")
      .run(body.name, body.about, user.id);
    moo.changed();
    return { user: { ...user, ...body } };
  });
  app.get("/api/resources", async (req) => {
    const u = member(req);
    return sql
      .prepare(
        `SELECT id,title,description,type,category,url,status,icon,updated_at AS updatedAt FROM resources ${u.role === "admin" ? "" : "WHERE status='active'"} ORDER BY type DESC,title`,
      )
      .all();
  });
  app.post("/api/resources", async (req) => {
    const u = admin(req),
      b = resourceSchema.parse(req.body),
      id = randomUUID();
    sql
      .prepare(
        "INSERT INTO resources (id,title,description,type,category,url,status,icon,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        b.title,
        b.description,
        b.type,
        b.category,
        b.url,
        b.status,
        "icon-cow-1.svg",
        clock(),
      );
    audit(u, "created resource", id);
    moo.changed();
    return { id };
  });
  app.put("/api/resources/:id", async (req) => {
    const u = admin(req),
      b = resourceSchema.parse(req.body);
    if (
      !sql
        .prepare(
          "UPDATE resources SET title=?,description=?,type=?,category=?,url=?,status=?,updated_at=? WHERE id=?",
        )
        .run(
          b.title,
          b.description,
          b.type,
          b.category,
          b.url,
          b.status,
          clock(),
          params(req).id,
        ).changes
    )
      fail(404, "Resource not found");
    audit(u, "updated resource", params(req).id);
    moo.changed();
    return { ok: true };
  });
  app.get("/api/invites", async (req) => {
    admin(req);
    return sql
      .prepare(
        "SELECT id,label,expires_at AS expiresAt,used_at AS usedAt,revoked_at AS revokedAt FROM invites ORDER BY rowid DESC",
      )
      .all();
  });
  app.post("/api/invites", async (req) => {
    const u = admin(req),
      body = z
        .strictObject({ label: z.string().trim().min(1).max(80) })
        .parse(req.body),
      token = randomBytes(32).toString("hex"),
      id = randomUUID();
    sql
      .prepare(
        "INSERT INTO invites (id,token_hash,label,created_by,expires_at) VALUES (?,?,?,?,?)",
      )
      .run(id, hash(token), body.label, u.id, clock() + 7 * 86400);
    audit(u, "created invitation", id);
    return { id, token, expiresAt: clock() + 7 * 86400 };
  });
  app.delete("/api/invites/:id", async (req) => {
    admin(req);
    sql
      .prepare("UPDATE invites SET revoked_at=? WHERE id=? AND used_at IS NULL")
      .run(clock(), params(req).id);
    return { ok: true };
  });
  app.post("/api/invites/redeem", async (req) => {
    const u = auth(req),
      { token } = z.strictObject({ token: inviteTokenSchema }).parse(req.body);
    sql.transaction(() => {
      const invite = sql
        .prepare("SELECT * FROM invites WHERE token_hash=?")
        .get(hash(token)) as any;
      if (!invite || invite.revoked_at || invite.expires_at <= clock())
        fail(
          410,
          "This invitation is invalid or expired. Ask an administrator for another.",
        );
      if (invite.used_at) {
        if (invite.used_by === u.id) return;
        fail(409, "This invitation has already been used.");
      }
      sql
        .prepare(
          "UPDATE invites SET used_at=?,used_by=? WHERE id=? AND used_at IS NULL",
        )
        .run(clock(), u.id, invite.id);
      sql
        .prepare(
          "UPDATE users SET role=CASE WHEN role='admin' THEN 'admin' ELSE 'member' END WHERE pubkey=?",
        )
        .run(u.id);
      audit(u, "redeemed invitation", invite.id);
    })();
    moo.changed();
    return { ok: true };
  });
  app.get("/api/admin/members", async (req) => {
    admin(req);
    return sql
      .prepare(
        "SELECT pubkey AS id,name,about,role FROM users WHERE length(pubkey)=64 ORDER BY name",
      )
      .all();
  });
  app.put("/api/admin/members/:id", async (req) => {
    const u = admin(req),
      key = pubkeySchema.parse(params(req).id),
      { role } = z
        .strictObject({ role: z.enum(["member", "admin", "follower"]) })
        .parse(req.body);
    sql.transaction(() => {
      const target = sql
        .prepare("SELECT role FROM users WHERE pubkey=?")
        .get(key) as { role: string } | undefined;
      if (!target) fail(404, "Member not found");
      if (
        target.role === "admin" &&
        role !== "admin" &&
        (
          sql
            .prepare(
              "SELECT count(*) AS n FROM users WHERE role='admin' AND length(pubkey)=64",
            )
            .get() as { n: number }
        ).n === 1
      )
        fail(409, "The last administrator cannot be removed");
      sql.prepare("UPDATE users SET role=? WHERE pubkey=?").run(role, key);
      if (role === "follower") {
        sql.prepare("DELETE FROM sessions WHERE pubkey=?").run(key);
        sql.prepare("DELETE FROM push_subscriptions WHERE pubkey=?").run(key);
        moo.revoke(key);
      }
      audit(u, `changed role to ${role}`, key);
    })();
    moo.changed();
    return { ok: true };
  });
  app.get("/api/moo/state", async (req) => moo.state(member(req).id));
  app.post("/api/moo/presence", async (req) =>
    moo.presence(member(req).id, presenceSchema.parse(req.body).action),
  );
  app.post("/api/moo/requests", async (req) =>
    moo.ring(member(req).id, ringSchema.parse(req.body).key),
  );
  app.post("/api/moo/requests/:id", async (req) =>
    moo.action(
      member(req).id,
      params(req).id,
      requestActionSchema.parse(req.body).action,
    ),
  );
  app.get("/api/push/subscriptions", async (req) => {
    const u = member(req);
    return {
      configured: push.enabled,
      subscribed: !!sql
        .prepare(
          "SELECT id FROM push_subscriptions WHERE pubkey=? AND session_hash=?",
        )
        .get(u.id, req.sessionHash),
    };
  });
  app.post("/api/push/subscriptions", async (req) => {
    const u = member(req);
    if (!push.enabled)
      fail(503, "Push notifications are not configured on this server yet");
    const b = pushSchema.parse(req.body);
    if (!allowedPushEndpoint(b.endpoint))
      fail(400, "Unsupported push provider");
    sql
      .prepare(
        "INSERT INTO push_subscriptions (id,pubkey,session_hash,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET pubkey=excluded.pubkey,session_hash=excluded.session_hash,p256dh=excluded.p256dh,auth=excluded.auth",
      )
      .run(
        randomUUID(),
        u.id,
        req.sessionHash,
        b.endpoint,
        b.keys.p256dh,
        b.keys.auth,
        clock(),
      );
    return { ok: true };
  });
  app.delete("/api/push/subscriptions", async (req) => {
    const u = member(req);
    sql
      .prepare(
        "DELETE FROM push_subscriptions WHERE pubkey=? AND session_hash=?",
      )
      .run(u.id, req.sessionHash);
    return { ok: true };
  });
  app.post("/api/push/test", async (req) => {
    const u = member(req);
    if (!push.enabled) fail(503, "Push notifications are not configured yet");
    if (
      !sql
        .prepare(
          "SELECT id FROM push_subscriptions WHERE pubkey=? AND session_hash=?",
        )
        .get(u.id, req.sessionHash)
    )
      fail(409, "Enable notifications on this device first");
    moo.queue(u.id, "test", String(clock() + 60), randomUUID());
    return { ok: true };
  });
  const streams = new Set<() => void>();
  const counts = new Map<string, number>();
  app.get("/api/realtime", async (req, reply) => {
    const u = member(req);
    if ((counts.get(u.id) || 0) >= 5) fail(429, "Too many open connections");
    counts.set(u.id, (counts.get(u.id) || 0) + 1);
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      moo.changes.off("change", send);
      streams.delete(cleanup);
      counts.set(u.id, Math.max(0, (counts.get(u.id) || 1) - 1));
      reply.raw.end();
    };
    const valid = () => {
      const current = req.sessionHash && sessionUser(req.sessionHash);
      return current && current.role !== "follower";
    };
    const send = () => {
      if (!valid()) {
        reply.raw.write("event: revoked\ndata: {}\n\n");
        cleanup();
        return;
      }
      reply.raw.write("event: change\ndata: {}\n\n");
    };
    const timer = setInterval(() => {
      if (!valid()) {
        send();
        return;
      }
      reply.raw.write(": heartbeat\n\n");
    }, 1000);
    timer.unref();
    moo.changes.on("change", send);
    streams.add(cleanup);
    req.raw.on("close", cleanup);
    send();
  });
  const timer =
    options.workers === false
      ? null
      : setInterval(() => {
          void Promise.all([push.drain(), android.drain()])
            .catch((e) => app.log.error({ err: e }, "Moo worker failed"));
        }, 1000);
  timer?.unref();
  if (existsSync(resolve("dist/client/index.html"))) {
    await app.register(staticFiles, {
      root: resolve("dist/client"),
      prefix: "/",
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/") ||
      req.url.startsWith("/uploads/") ||
      /\.[^/]+$/.test(req.url.split("?")[0])
        ? reply.code(404).send({ error: "Not found" })
        : reply.type("text/html").sendFile("index.html"),
    );
  }
  app.addHook("preClose", async () => {
    if (timer) clearInterval(timer);
    for (const close of streams) close();
    await Promise.all([push.stop(),android.stop()]);
  });
  app.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
    sql.close();
  });
  return { app, config, store, moo, push, android };
}
