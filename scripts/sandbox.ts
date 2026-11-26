import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { getPublicKey } from "nostr-tools/pure";
import { createApp } from "../server/app.js";
import {
  sandboxKey,
  sandboxProfiles,
  sandboxOrigin,
} from "../shared/sandbox.js";
import { sandboxProxy, sandboxBoundary } from "./sandbox-proxy.js";
import {
  occupiedPorts,
  existingSandbox,
  sandboxStatus,
  sandboxLinks,
} from "./sandbox-lifecycle.js";

if (process.env.NODE_ENV === "production")
  throw Error("The sandbox is available only for local development.");
const temporary = process.argv.includes("--temporary");
if (temporary && process.argv.includes("--reset"))
  throw Error("Choose --temporary or --reset, not both.");
const stopping = process.argv.includes("--stop");
if (stopping && (temporary || process.argv.includes("--reset")))
  throw Error(
    "Use --stop on its own, then start again with --reset if needed.",
  );
// Check ports before opening or deleting any database.
const occupied = await occupiedPorts();
if (occupied.length || stopping) {
  const existing = occupied.length ? await existingSandbox() : null;
  if (stopping) {
    if (!occupied.length) {
      console.log("The local sandbox is already stopped.");
      process.exit(0);
    }
    if (!existing) {
      console.error(
        "The occupied ports do not identify this project's sandbox. No process was stopped.",
      );
      process.exit(1);
    }
    process.kill(existing.pid, "SIGTERM");
    const deadline = Date.now() + 10000;
    while ((await occupiedPorts()).length) {
      if (Date.now() >= deadline) {
        console.error("The sandbox is still shutting down. Try again shortly.");
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log("Local sandbox stopped. Test data has been preserved.");
    process.exit(0);
  }
  if (
    existing &&
    !existing.temporary &&
    !temporary &&
    !process.argv.includes("--reset")
  ) {
    console.log(
      "The local sandbox is already running. Open an existing test session:",
    );
    sandboxLinks();
    console.log("To stop it: npm run dev:sandbox -- --stop");
    process.exit(0);
  }
  console.error(
    `Local sandbox ports are already in use: ${occupied.join(", ")}.`,
  );
  if (existing) console.error("Stop it first: npm run dev:sandbox -- --stop");
  else
    console.error(
      "Stop the process using these ports, then retry. No data was changed.",
    );
  process.exit(1);
}
const dataDir = temporary
  ? await mkdtemp(join(tmpdir(), "bitpolito-sandbox-"))
  : resolve("data/sandbox");
if (process.argv.includes("--reset"))
  await rm(dataDir, { recursive: true, force: true });
const services: Awaited<ReturnType<typeof createApp>>[] = [];
let broadcasting = false;
const bridges = new Map<Awaited<ReturnType<typeof createApp>>, () => void>();
const servers: ViteDevServer[] = [];
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  for (const [service, bridge] of bridges)
    service.moo.changes.off("change", bridge);
  // End API event streams before closing their Vite proxies, including when
  // browser tabs are still connected.
  await Promise.allSettled(services.map((service) => service.app.close()));
  await Promise.allSettled(servers.map((server) => server.close()));
  if (temporary) await rm(dataDir, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void close().then(() => process.exit(0));
  });
try {
  for (const profile of sandboxProfiles) {
    const origin = sandboxOrigin(profile);
    const port = 3180 + services.length;
    const service = await createApp({
      dataDir,
      origin,
      host: "127.0.0.1",
      port,
      cookieSecure: false,
      trustProxy: false,
      relays: [],
      pushPublicKey: "",
      pushPrivateKey: "",
    });
    services.push(service);
    if (services.length === 1)
      for (const actor of sandboxProfiles) {
        const key = sandboxKey(actor.key);
        service.store.sqlite
          .prepare(
            "INSERT OR IGNORE INTO users (pubkey,name,role,created_at) VALUES (?,?,?,?)",
          )
          .run(
            getPublicKey(key),
            actor.name,
            actor.role,
            Math.floor(Date.now() / 1000),
          );
        key.fill(0);
      }
    // Each origin keeps the normal NIP-98 URL binding. All API instances use
    // the same sandbox DB and broadcast state changes to the other tabs.
    const bridge = () => {
      if (broadcasting) return;
      broadcasting = true;
      try {
        for (const other of services)
          if (other !== service) other.moo.changed();
      } finally {
        broadcasting = false;
      }
    };
    bridges.set(service, bridge);
    service.moo.changes.on("change", bridge);
    await service.app.listen({ host: "127.0.0.1", port });
    const server = await createServer({
      cacheDir: resolve(`node_modules/.vite-sandbox-${profile.id}`),
      configFile: resolve("vite.config.ts"),
      server: {
        host: "127.0.0.1",
        port: profile.port,
        strictPort: true,
        proxy: { "/api": sandboxProxy(`http://127.0.0.1:${port}`, profile.id) },
      },
      plugins: [
        {
          name: "bitpolito-local-sandbox",
          configureServer(server) {
            server.middlewares.use(sandboxBoundary(origin));
            server.middlewares.use((req, res, next) => {
              if (req.url !== "/__sandbox/status" || req.method !== "GET")
                return next();
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              });
              res.end(JSON.stringify(sandboxStatus(profile.id, temporary)));
            });
          },
          transformIndexHtml() {
            return [
              {
                tag: "script",
                attrs: { id: "bitpolito-sandbox", type: "application/json" },
                children: JSON.stringify({ profile: profile.id }),
                injectTo: "head",
              },
              {
                tag: "script",
                attrs: { type: "module", src: "/scripts/sandbox-client.ts" },
                injectTo: "body",
              },
            ];
          },
        },
      ],
    });
    servers.push(server);
    await server.listen();
  }
  console.log(
    "\nBitPolito local sandbox — disposable test identities, no external relay.",
  );
  sandboxLinks();
  console.log(
    `Data: ${dataDir}\nOpen each link in a tab and choose Use test identity. Ctrl+C stops the sandbox.`,
  );
} catch (error) {
  await close();
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(
      "A sandbox port was taken during startup. Stop the other process, then retry. Existing data was preserved.",
    );
    process.exitCode = 1;
  } else throw error;
}
