import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import { createApp, hash } from "../server/app.js";
import { readConfig } from "../server/config.js";
import { nextRomeMidnight } from "../server/moo.js";
import { allowedPushEndpoint } from "../server/push.js";
const origin = "http://localhost:5173",
  headers = { origin, "x-bitpolito-request": "1" };
let dir: string, service: Awaited<ReturnType<typeof createApp>>, now: number;
const keys = [
  generateSecretKey(),
  generateSecretKey(),
  generateSecretKey(),
  generateSecretKey(),
];
const ids = keys.map(getPublicKey);
async function req(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
  cookie?: string,
) {
  return service.app.inject({
    method,
    url,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { payload: body as any }),
  });
}
async function auth(index: number) {
  const result = await req("GET", "/api/auth/challenge"),
    challenge = result.json().challenge;
  const cookie = result.headers["set-cookie"]!.toString().split(";")[0],
    payload = JSON.stringify({ challenge });
  const event = finalizeEvent(
    {
      kind: 27235,
      content: "",
      created_at: now,
      tags: [
        ["u", `${origin}/api/auth/session`],
        ["method", "POST"],
        ["payload", hash(payload)],
      ],
    },
    keys[index],
  );
  const login = await service.app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload,
    headers: {
      ...headers,
      cookie,
      "content-type": "application/json",
      authorization: `Nostr ${Buffer.from(JSON.stringify(event)).toString("base64")}`,
    },
  });
  expect(login.statusCode, login.body).toBe(200);
  return {
    cookie: `bp_session=${login.cookies.find((c) => c.name === "bp_session")!.value}`,
    challenge,
    event,
    payload,
    challengeCookie: cookie,
  };
}
function role(index: number, value: string) {
  service.store.sqlite
    .prepare("UPDATE users SET role=? WHERE pubkey=?")
    .run(value, ids[index]);
}
beforeEach(async () => {
  now = Date.parse("2026-11-15T11:00:00Z") / 1000;
  dir = await mkdtemp(join(tmpdir(), "bitpolito-hub-"));
  service = await createApp(
    { dataDir: dir },
    { clock: () => now, workers: false },
  );
  await service.app.ready();
});
afterEach(async () => {
  await service.app.close();
  await rm(dir, { recursive: true, force: true });
});
it("validates signed, browser-bound authentication and rejects replay and legacy preview access", async () => {
  const a = await auth(0);
  expect(
    (await req("GET", "/api/me", undefined, a.cookie)).json().user.role,
  ).toBe("follower");
  expect((await req("GET", "/api/resources")).statusCode).toBe(401);
  expect(
    (await req("GET", "/api/resources", undefined, a.cookie)).statusCode,
  ).toBe(403);
  for (const path of [
    "/api/workspace/events",
    "/api/workspace/projects",
    "/api/preview/session",
  ])
    expect(
      (await req(path.endsWith("session") ? "POST" : "GET", path)).statusCode,
    ).toBe(404);
  const authorization = `Nostr ${Buffer.from(JSON.stringify(a.event)).toString("base64")}`;
  expect(
    (
      await service.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: a.payload,
        headers: {
          ...headers,
          cookie: a.challengeCookie,
          authorization,
          "content-type": "application/json",
        },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await req("POST", "/api/auth/session", { challenge: a.challenge }))
      .statusCode,
  ).toBe(401);
  const result = await req("GET", "/api/auth/challenge"),
    challenge = result.json().challenge,
    cookie = result.headers["set-cookie"]!.toString().split(";")[0],
    payload = JSON.stringify({ challenge });
  for (const [method, url, stamp] of [
    ["GET", `${origin}/api/auth/session`, now],
    ["POST", "https://evil.example/api/auth/session", now],
    ["POST", `${origin}/api/auth/session`, now - 61],
  ] as const) {
    const event = finalizeEvent(
      {
        kind: 27235,
        content: "",
        created_at: stamp,
        tags: [
          ["u", url],
          ["method", method],
          ["payload", hash(payload)],
        ],
      },
      keys[0],
    );
    expect(
      (
        await service.app.inject({
          method: "POST",
          url: "/api/auth/session",
          payload,
          headers: {
            ...headers,
            cookie,
            "content-type": "application/json",
            authorization: `Nostr ${Buffer.from(JSON.stringify(event)).toString("base64")}`,
          },
        })
      ).statusCode,
    ).toBe(401);
  }
  expect(() => readConfig({ origin: "http://public.example" })).toThrow(
    /HTTPS/,
  );
  expect(() =>
    readConfig({ origin: "https://hub.example", cookieSecure: false }),
  ).toThrow(/COOKIE_SECURE/);
  expect(
    (
      await service.app.inject({
        url: "/api/config",
        headers: { host: "evil.example" },
      })
    ).statusCode,
  ).toBe(403);
});
it("redeems one-use invites atomically, supports expiry/revoke and admin-only resources", async () => {
  const a = await auth(0);
  role(0, "admin");
  const b = await auth(1),
    c = await auth(2);
  const invitation = (
    await req("POST", "/api/invites", { label: "A teammate" }, a.cookie)
  ).json();
  expect(
    (
      await req(
        "POST",
        "/api/invites/redeem",
        { token: invitation.token },
        b.cookie,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await req(
        "POST",
        "/api/invites/redeem",
        { token: invitation.token },
        c.cookie,
      )
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await req(
        "POST",
        "/api/invites/redeem",
        { token: invitation.token },
        b.cookie,
      )
    ).statusCode,
  ).toBe(200);
  const expired = (
    await req("POST", "/api/invites", { label: "Expires" }, a.cookie)
  ).json();
  now += 7 * 86400 + 1;
  const fresh = await auth(2);
  expect(
    (
      await req(
        "POST",
        "/api/invites/redeem",
        { token: expired.token },
        fresh.cookie,
      )
    ).statusCode,
  ).toBe(410);
  const admin = await auth(0),
    member = await auth(1);
  const resource = {
    title: "Useful tool",
    description: "A link",
    type: "tool",
    category: "Learn",
    url: "https://example.com/tool",
    status: "active",
  };
  expect(
    (await req("POST", "/api/resources", resource, member.cookie)).statusCode,
  ).toBe(403);
  const created = (
    await req("POST", "/api/resources", resource, admin.cookie)
  ).json();
  expect(created.id).toBeTruthy();
  await req(
    "PUT",
    `/api/resources/${created.id}`,
    { ...resource, status: "archived" },
    admin.cookie,
  );
  expect(
    (await req("GET", "/api/resources", undefined, member.cookie))
      .json()
      .some((r: any) => r.id === created.id),
  ).toBe(false);
  expect(
    (await req("GET", "/api/resources", undefined, admin.cookie))
      .json()
      .some((r: any) => r.id === created.id),
  ).toBe(true);
  expect(
    (
      await req(
        "PUT",
        `/api/admin/members/${ids[0]}`,
        { role: "member" },
        admin.cookie,
      )
    ).statusCode,
  ).toBe(409);
});
async function participants() {
  const a = await auth(0),
    b = await auth(1),
    c = await auth(2);
  role(0, "admin");
  role(1, "member");
  role(2, "member");
  await req("POST", "/api/moo/presence", { action: "arrive" }, a.cookie);
  await req("POST", "/api/moo/presence", { action: "arrive" }, b.cookie);
  return { a, b, c };
}
it("assigns exactly one opener, isolates requests and handles cancellation, completion and idempotency", async () => {
  const { a, b, c } = await participants();
  const key = randomUUID(),
    ring = await req("POST", "/api/moo/requests", { key }, c.cookie),
    id = ring.json().id;
  expect(
    (await req("POST", "/api/moo/requests", { key }, c.cookie)).json().id,
  ).toBe(id);
  const results = await Promise.all([
    req("POST", `/api/moo/requests/${id}`, { action: "claim" }, a.cookie),
    req("POST", `/api/moo/requests/${id}`, { action: "claim" }, b.cookie),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const owner = service.moo.get(id).claimedBy === ids[0] ? a : b,
    other = owner === a ? b : a;
  expect(
    (
      await req(
        "POST",
        `/api/moo/requests/${id}`,
        { action: "opened" },
        other.cookie,
      )
    ).statusCode,
  ).toBe(410);
  expect(
    (
      await req(
        "POST",
        `/api/moo/requests/${id}`,
        { action: "inside" },
        other.cookie,
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await req(
        "POST",
        `/api/moo/requests/${id}`,
        { action: "inside" },
        c.cookie,
      )
    ).json().status,
  ).toBe("resolved");
  expect(
    (
      await req(
        "POST",
        `/api/moo/requests/${id}`,
        { action: "inside" },
        c.cookie,
      )
    ).json().status,
  ).toBe("resolved");
  expect(service.moo.people().map((p) => p.id)).toContain(ids[2]);
  await req("POST", "/api/moo/presence", { action: "leave" }, c.cookie);
  // A replay of an already completed entry must not undo an immediate departure.
  await req("POST", `/api/moo/requests/${id}`, { action: "inside" }, c.cookie);
  expect(service.moo.people().map((p) => p.id)).not.toContain(ids[2]);
  expect(
    (await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie))
      .statusCode,
  ).toBe(429);
  now += 61;
  const next = (
    await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
  ).json();
  await req(
    "POST",
    `/api/moo/requests/${next.id}`,
    { action: "cancel" },
    c.cookie,
  );
  expect(service.moo.get(next.id).status).toBe("cancelled");
  const outsider = await auth(3);
  role(3, "member");
  expect(
    (await req("GET", "/api/moo/state", undefined, outsider.cookie)).json()
      .incoming,
  ).toEqual([]);
});
it("expires presence, reminders and claims correctly across restart", async () => {
  const { a, c } = await participants();
  const id = (
    await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
  ).json().id;
  now += 60;
  await service.push.drain();
  expect(
    (
      service.store.sqlite
        .prepare("SELECT count(*) n FROM push_jobs WHERE purpose='reminder'")
        .get() as any
    ).n,
  ).toBe(2);
  await service.push.drain();
  expect(
    (
      service.store.sqlite
        .prepare("SELECT count(*) n FROM push_jobs WHERE purpose='reminder'")
        .get() as any
    ).n,
  ).toBe(2);
  await req("POST", `/api/moo/requests/${id}`, { action: "claim" }, a.cookie);
  now += 91;
  service.moo.settle();
  expect(service.moo.get(id).status).toBe("waiting");
  await service.app.close();
  service = await createApp(
    { dataDir: dir },
    { clock: () => now, workers: false },
  );
  await service.app.ready();
  expect(
    (await req("GET", "/api/moo/state", undefined, c.cookie)).json().own.id,
  ).toBe(id);
  now += 40;
  expect(
    (await req("GET", "/api/moo/state", undefined, c.cookie)).json().own.status,
  ).toBe("expired");
  now = nextRomeMidnight(now);
  expect(
    (await req("GET", "/api/moo/state", undefined, a.cookie)).json().presence,
  ).toEqual([]);
  expect(
    (await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie))
      .statusCode,
  ).toBe(409);
});
it("revokes sessions, presence and claims immediately without deleting historical content", async () => {
  const { a, b, c } = await participants();
  const id = (
    await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
  ).json().id;
  await req("POST", `/api/moo/requests/${id}`, { action: "claim" }, b.cookie);
  service.store.sqlite
    .prepare(
      "INSERT INTO projects (id,title,created_at,updated_at) VALUES ('legacy','Keep this',1,1)",
    )
    .run();
  expect(
    (
      await req(
        "PUT",
        `/api/admin/members/${ids[1]}`,
        { role: "follower" },
        a.cookie,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (await req("GET", "/api/moo/state", undefined, b.cookie)).statusCode,
  ).toBe(401);
  expect(service.moo.get(id).status).toBe("waiting");
  expect(service.moo.people().map((p) => p.id)).not.toContain(ids[1]);
  expect(
    service.store.sqlite
      .prepare("SELECT title FROM projects WHERE id='legacy'")
      .get(),
  ).toEqual({ title: "Keep this" });
});
it("queues push durably, skips obsolete rings and retires expired subscriptions", async () => {
  await service.app.close();
  const sent: string[] = [];
  let failures = 1;
  service = await createApp(
    { dataDir: dir, pushPublicKey: "test-key", pushPrivateKey: "test-private" },
    {
      clock: () => now,
      workers: false,
      pushSender: async (_sub, payload) => {
        if (failures-- > 0)
          throw Object.assign(Error("temporary"), { statusCode: 503 });
        sent.push(payload);
      },
    },
  );
  await service.app.ready();
  const { a, c } = await participants();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/example",
    keys: { p256dh: "x".repeat(87), auth: "y".repeat(22) },
  };
  expect(
    (await req("POST", "/api/push/subscriptions", subscription, a.cookie))
      .statusCode,
  ).toBe(200);
  const id = (
    await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
  ).json().id;
  await service.push.drain();
  expect(sent).toHaveLength(0);
  now += 6;
  await service.push.drain();
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toContain(ids[2]);
  await req("POST", `/api/moo/requests/${id}`, { action: "cancel" }, c.cookie);
  now += 61;
  await service.push.drain();
  expect(sent).toHaveLength(1);
  expect(allowedPushEndpoint("https://127.0.0.1/secret")).toBe(false);
  expect(allowedPushEndpoint("https://fcm.googleapis.com@evil.example/")).toBe(
    false,
  );
  await req("POST", "/api/auth/logout", undefined, a.cookie);
  expect(
    (
      service.store.sqlite
        .prepare("SELECT count(*) n FROM push_subscriptions")
        .get() as any
    ).n,
  ).toBe(0);
});

it("validates signature bytes and exact payload, and rejects cross-origin mutations", async () => {
  const response = await req("GET", "/api/auth/challenge"),
    challenge = response.json().challenge,
    cookie = response.cookies[0].name + "=" + response.cookies[0].value;
  const payload = JSON.stringify({ challenge });
  const good = finalizeEvent(
    {
      kind: 27235,
      content: "",
      created_at: now,
      tags: [
        ["u", `${origin}/api/auth/session`],
        ["method", "POST"],
        ["payload", hash(payload)],
      ],
    },
    keys[0],
  );
  for (const [event, body] of [
    [{ ...good, sig: "0".repeat(128) }, payload],
    [good, JSON.stringify({ challenge, name: "tampered" })],
  ] as const) {
    const result = await service.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: body,
      headers: {
        ...headers,
        cookie,
        "content-type": "application/json",
        authorization: `Nostr ${Buffer.from(JSON.stringify(event)).toString("base64")}`,
      },
    });
    expect(result.statusCode).toBe(401);
  }
  const a = await auth(0);
  role(0, "admin");
  expect(
    (
      await service.app.inject({
        method: "POST",
        url: "/api/invites",
        payload: { label: "bad origin" },
        headers: {
          ...headers,
          origin: "https://evil.example",
          cookie: a.cookie,
        },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await service.app.inject({
        method: "POST",
        url: "/api/invites",
        payload: { label: "missing header" },
        headers: { origin, cookie: a.cookie },
      })
    ).statusCode,
  ).toBe(403);
});
it("keeps invite redemption single-use under concurrent requests and honors invitation revocation", async () => {
  const a = await auth(0);
  role(0, "admin");
  const b = await auth(1),
    c = await auth(2);
  const invitation = (
    await req("POST", "/api/invites", { label: "Concurrent" }, a.cookie)
  ).json();
  const results = await Promise.all([
    req("POST", "/api/invites/redeem", { token: invitation.token }, b.cookie),
    req("POST", "/api/invites/redeem", { token: invitation.token }, c.cookie),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const revoked = (
    await req("POST", "/api/invites", { label: "Revoked" }, a.cookie)
  ).json();
  await req("DELETE", `/api/invites/${revoked.id}`, undefined, a.cookie);
  expect(
    (
      await req(
        "POST",
        "/api/invites/redeem",
        { token: revoked.token },
        c.cookie,
      )
    ).statusCode,
  ).toBe(410);
});
it("caps claim extensions, supports manual inside confirmation and releases leaving responders", async () => {
  const { a, b, c } = await participants();
  const id = (
      await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
    ).json().id,
    start = now;
  now = start + 170;
  await req("POST", `/api/moo/requests/${id}`, { action: "claim" }, a.cookie);
  expect(service.moo.get(id).expiresAt).toBe(start + 260);
  await req("POST", `/api/moo/requests/${id}`, { action: "release" }, a.cookie);
  now = start + 250;
  await req("POST", `/api/moo/requests/${id}`, { action: "claim" }, b.cookie);
  expect(service.moo.get(id).expiresAt).toBe(start + 300);
  await req("POST", "/api/moo/presence", { action: "leave" }, b.cookie);
  expect(service.moo.get(id).status).toBe("waiting");
  expect(
    (
      await req(
        "POST",
        `/api/moo/requests/${id}`,
        { action: "release" },
        b.cookie,
      )
    ).statusCode,
  ).toBe(403);
  const inside = await req(
    "POST",
    `/api/moo/requests/${id}`,
    { action: "inside" },
    c.cookie,
  );
  expect(inside.json().resolvedReason).toBe("inside");
  expect(
    (await req("POST", "/api/moo/requests", { key: randomUUID() }, a.cookie))
      .statusCode,
  ).toBe(409);
  now = nextRomeMidnight(now) - 600;
  await service.push.drain();
  expect(
    (
      service.store.sqlite
        .prepare("SELECT count(*) n FROM push_jobs WHERE purpose='presence'")
        .get() as any
    ).n,
  ).toBe(0);
  const extended = await req(
    "POST",
    "/api/moo/presence",
    { action: "extend" },
    a.cookie,
  );
  expect(extended.statusCode).toBe(410);
  expect(extended.json().error).toMatch(/retired/);
});
it("closes an already-open SSE stream when its membership is revoked", async () => {
  const { a, b } = await participants();
  const address = await service.app.listen({ host: "127.0.0.1", port: 0 });
  const response = await fetch(address + "/api/realtime", {
    headers: { cookie: b.cookie },
  });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain("event: change");
  await req(
    "PUT",
    `/api/admin/members/${ids[1]}`,
    { role: "follower" },
    a.cookie,
  );
  let text = "";
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    text += new TextDecoder().decode(next.value);
  }
  expect(text).toContain("event: revoked");
  expect(
    (await req("GET", "/api/resources", undefined, b.cookie)).statusCode,
  ).toBe(401);
});
it("retires dead push endpoints and preserves notification work through restart", async () => {
  await service.app.close();
  let calls = 0;
  service = await createApp(
    { dataDir: dir, pushPublicKey: "test-key", pushPrivateKey: "test-private" },
    {
      clock: () => now,
      workers: false,
      pushSender: async () => {
        calls++;
        throw Object.assign(Error("expired"), { statusCode: 410 });
      },
    },
  );
  await service.app.ready();
  const { a, c } = await participants();
  await req(
    "POST",
    "/api/push/subscriptions",
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/expired",
      keys: { p256dh: "x".repeat(87), auth: "y".repeat(22) },
    },
    a.cookie,
  );
  const id = (
    await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
  ).json().id;
  await service.app.close();
  service = await createApp(
    { dataDir: dir, pushPublicKey: "test-key", pushPrivateKey: "test-private" },
    {
      clock: () => now,
      workers: false,
      pushSender: async () => {
        calls++;
        throw Object.assign(Error("expired"), { statusCode: 410 });
      },
    },
  );
  await service.app.ready();
  await service.push.drain();
  expect(calls).toBe(1);
  expect(
    (
      service.store.sqlite
        .prepare("SELECT count(*) n FROM push_subscriptions")
        .get() as any
    ).n,
  ).toBe(0);
  expect(service.moo.get(id).status).toBe("waiting");
});

it("excludes static assets from API throttling and isolates authenticated members sharing one IP", async () => {
  const a = await auth(0),
    b = await auth(1);
  role(0, "member");
  role(1, "member");
  for (let i = 0; i < 245; i++)
    expect((await req("GET", "/icons/icon-192.png")).statusCode).not.toBe(429);
  expect((await req("GET", "/api/me", undefined, a.cookie)).statusCode).toBe(
    200,
  );
  let limited = false;
  for (let i = 0; i < 245; i++) {
    const response = await req("GET", "/api/me", undefined, a.cookie);
    if (response.statusCode === 429) limited = true;
  }
  expect(limited).toBe(true);
  expect(
    (await req("GET", "/api/resources", undefined, b.cookie)).statusCode,
  ).toBe(200);
  expect((await req("GET", "/api/health")).statusCode).toBe(200);
});

it("clears presence at Rome midnight across winter, summer and both clock changes", () => {
  for (const [from, until] of [
    ["2026-01-15T12:00:00Z", "2026-01-15T23:00:00Z"],
    ["2026-07-15T12:00:00Z", "2026-07-15T22:00:00Z"],
    ["2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z"],
    ["2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"],
    ["2026-12-31T23:00:00Z", "2027-01-01T23:00:00Z"],
    ["2026-11-15T22:59:59Z", "2026-11-15T23:00:00Z"],
  ])
    expect(nextRomeMidnight(Date.parse(from) / 1000)).toBe(
      Date.parse(until) / 1000,
    );
});
it("preserves legacy expiry until check-in and never checks in cancelled or expired arrivals", async () => {
  const { a, c } = await participants();
  service.store.sqlite
    .prepare("UPDATE presence SET expires_at=? WHERE pubkey=?")
    .run(now + 1000, ids[0]);
  expect(service.moo.people().find((p) => p.id === ids[0])?.expiresAt).toBe(
    now + 1000,
  );
  await req("POST", "/api/moo/presence", { action: "arrive" }, a.cookie);
  expect(service.moo.people().find((p) => p.id === ids[0])?.expiresAt).toBe(
    nextRomeMidnight(now),
  );
  const ring = (
    await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
  ).json();
  await req(
    "POST",
    `/api/moo/requests/${ring.id}`,
    { action: "cancel" },
    c.cookie,
  );
  expect(
    (
      await req(
        "POST",
        `/api/moo/requests/${ring.id}`,
        { action: "inside" },
        c.cookie,
      )
    ).statusCode,
  ).toBe(409);
  now += 61;
  const next = (
    await req("POST", "/api/moo/requests", { key: randomUUID() }, c.cookie)
  ).json();
  now += 181;
  expect(
    (
      await req(
        "POST",
        `/api/moo/requests/${next.id}`,
        { action: "inside" },
        c.cookie,
      )
    ).statusCode,
  ).toBe(409);
  expect(service.moo.people().map((p) => p.id)).not.toContain(ids[2]);
});
