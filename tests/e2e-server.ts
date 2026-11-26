import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPublicKey } from "nostr-tools/pure";
import * as webpush from "web-push";
import { createApp } from "../server/app.js";
import { startNostrFixture, testKey } from "./nostr-fixture.js";
const dir = await mkdtemp(join(tmpdir(), "bitpolito-hub-browser-")),
  relay = await startNostrFixture(),
  push = webpush.generateVAPIDKeys();
const service = await createApp(
  {
    dataDir: dir,
    origin: process.env.TEST_APP_ORIGIN || "http://127.0.0.1:5173",
    port: Number(process.env.TEST_APP_PORT || 3001),
    relays: [relay.url],
    pushPublicKey: push.publicKey,
    pushPrivateKey: push.privateKey,
  },
  { pushSender: async () => {} },
);
for (const [n, name, role] of [
  [1, "Alice", "admin"],
  [2, "Bob", "member"],
  [3, "Cara", "member"],
  [5, "Cara", "member"],
  [7, "Alice", "member"],
  [8, "Bob", "member"],
  [9, "Cara", "member"],
  [10, "Alice", "member"],
  [11, "Bob", "member"],
  [12, "Cara", "member"],
  [13, "Ari", "member"],
  [14, "Nova", "member"],
  [15, "Morgan", "member"],
  [16, "Ari", "member"],
  [17, "Nova", "member"],
  [18, "Morgan", "member"],
  [19, "Lee", "member"],
  [20, "Lee", "member"],
  [21, "Sam", "member"],
  [22, "Sam", "member"],
  [23, "Push Alice", "member"],
  [24, "Push Bob", "member"],
  [25, "Push Cara", "member"],
  [26, "Push Alice", "member"],
  [27, "Push Bob", "member"],
  [28, "Push Cara", "member"],
  [29, "Guide member", "member"],
  [30, "Guide member", "member"],
  [31, "Other member", "member"],
  [32, "Other member", "member"],
  [33, "Guide responder", "member"],
  [34, "Guide responder", "member"],
  [35, "Guide visitor", "member"],
  [36, "Guide visitor", "member"],
] as const)
  service.store.sqlite
    .prepare("INSERT INTO users (pubkey,name,role,created_at) VALUES (?,?,?,?)")
    .run(getPublicKey(testKey(n)), name, role, Math.floor(Date.now() / 1000));
await service.app.listen({ host: "127.0.0.1", port: service.config.port });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void (async () => {
      await service.app.close();
      await relay.close();
      await rm(dir, { recursive: true, force: true });
      process.exit(0);
    })();
  });
