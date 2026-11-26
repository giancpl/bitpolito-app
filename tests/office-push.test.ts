import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { beforeEach, it, expect, vi } from "vitest";
const memory = vi.hoisted(() => ({
  records: new Map<string, any>(),
  queue: Promise.resolve(),
}));
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  update: (key: string, mutate: (old: any) => any) => {
    const next = memory.queue.then(() => {
      memory.records.set(key, mutate(structuredClone(memory.records.get(key))));
    });
    memory.queue = next.catch(() => {});
    return next;
  },
}));
import {
  askForeground,
  foregroundAlert,
  officeAlertKey,
  systemAlert,
} from "../src/lib/office-alerts";
const workerSource = buildSync({
  entryPoints: ["src/service-worker.ts"],
  bundle: true,
  format: "cjs",
  write: false,
  external: ["./lib/office-alerts"],
}).outputFiles[0].text;
beforeEach(async () => {
  await memory.queue;
  memory.records.clear();
});
const request = { id: "r", status: "waiting", createdAt: 100, updatedAt: 100 };
function worker(
  status = 200,
  incoming: unknown[] = [],
  mode: "hidden" | "off" | "ready" | "late" = "hidden",
) {
  const handlers = new Map<string, (event: any) => void>();
  const showNotification = vi.fn(async () => {}),
    start = vi.fn(() => true);
  runInNewContext(workerSource, {
    URL,
    exports: {},
    require: () => ({ askForeground, officeAlertKey, systemAlert }),
    self: {
      location: { origin: "https://office.example" },
      registration: { showNotification },
      clients: {
        matchAll: async () => [
          {
            visibilityState: mode === "hidden" ? "hidden" : "visible",
            postMessage: (message: any, ports: MessagePort[]) => {
              if (mode === "late") {
                ports[0].close();
                return;
              }
              void foregroundAlert(
                message.key,
                () => mode === "ready",
                start,
              ).then((started) => {
                ports[0].postMessage({ started });
                ports[0].close();
              });
            },
          },
        ],
      },
      addEventListener: (name: string, fn: (event: any) => void) =>
        handlers.set(name, fn),
    },
    fetch: async () => ({
      status,
      ok: status === 200,
      json: async () => ({ incoming, serverTime: 110 }),
    }),
  });
  return {
    showNotification,
    start,
    push: async (data: unknown) => {
      let pending: Promise<void> | undefined;
      handlers.get("push")!({
        data: { json: () => data },
        waitUntil: (p: Promise<void>) => {
          pending = p;
        },
      });
      await pending;
    },
  };
}
it("discards delayed door pushes after leaving, claim, expiry or revoked access", async () => {
  for (const [status, incoming] of [
    [200, []],
    [200, [{ ...request, status: "claimed" }]],
    [401, []],
    [403, []],
  ] as const) {
    const sw = worker(status, [...incoming]);
    await sw.push({ purpose: "ring", request: "r", url: "/moo?request=r" });
    expect(sw.showNotification).not.toHaveBeenCalled();
  }
});
it("keeps a standard push audible when a visible page has sound off", async () => {
  const sw = worker(200, [request], "off");
  await sw.push({
    purpose: "ring",
    request: "r",
    url: "/moo?request=r",
    silent: false,
  });
  expect(sw.start).not.toHaveBeenCalled();
  expect(sw.showNotification).toHaveBeenCalledWith(
    "BitPolito · Office",
    expect.objectContaining({ silent: false, data: { url: "/moo?request=r" } }),
  );
});
it("silences a push only after a foreground audio start and keeps requester updates silent", async () => {
  const sw = worker(200, [request], "ready");
  await sw.push({ purpose: "ring", request: "r", silent: false });
  expect(sw.start).toHaveBeenCalledTimes(1);
  expect(sw.showNotification).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ silent: true }),
  );
  await sw.push({ purpose: "claimed", request: "r", silent: true });
  expect(sw.start).toHaveBeenCalledTimes(1);
  expect(sw.showNotification).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ silent: true }),
  );
});
it("falls back after 750 ms and prevents late audio after choosing the system channel", async () => {
  const sw = worker(200, [request], "late");
  const before = Date.now();
  await sw.push({ purpose: "ring", request: "r", silent: false });
  expect(Date.now() - before).toBeGreaterThanOrEqual(700);
  expect(sw.showNotification).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ silent: false }),
  );
  const late = vi.fn(() => true);
  expect(
    await foregroundAlert(officeAlertKey(request, 110), () => true, late),
  ).toBe(false);
  expect(late).not.toHaveBeenCalled();
});
it("serializes many foreground tabs and push retries into a single sound decision", async () => {
  const start = vi.fn(() => true),
    key = officeAlertKey(request, 110);
  await Promise.all(
    Array.from({ length: 20 }, () => foregroundAlert(key, () => true, start)),
  );
  expect(start).toHaveBeenCalledTimes(1);
  expect(await systemAlert(key)).toBe(false);
  const reminder = officeAlertKey(request, 161);
  expect(await systemAlert(reminder)).toBe(true);
  expect(await systemAlert(reminder)).toBe(false);
  expect(await foregroundAlert(reminder, () => true, start)).toBe(false);
  expect(start).toHaveBeenCalledTimes(1);
});
it("failed or ineligible audio starts do not consume an alert", async () => {
  const key = officeAlertKey(request, 110),
    start = vi.fn(() => false);
  expect(await foregroundAlert(key, () => false, start)).toBe(false);
  expect(start).not.toHaveBeenCalled();
  expect(await foregroundAlert(key, () => true, start)).toBe(false);
  expect(await systemAlert(key)).toBe(true);
});
it("keeps provider retries silent and allows a new sound for the single reminder", async () => {
  const sw = worker(500);
  await sw.push({ purpose: "ring", request: "r", silent: false });
  expect(sw.showNotification).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ silent: false }),
  );
  await sw.push({ purpose: "ring", request: "r", silent: false });
  expect(sw.showNotification).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ silent: true }),
  );
  await sw.push({ purpose: "reminder", request: "r", silent: false });
  expect(sw.showNotification).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ silent: false, renotify: true }),
  );
});
