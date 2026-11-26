import { createServer } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import {
  existingSandbox,
  occupiedPorts,
  sandboxStatus,
} from "../scripts/sandbox-lifecycle.js";
afterEach(() => vi.unstubAllGlobals());
it("detects occupied ports without touching the listening process", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    expect(await occupiedPorts([port])).toEqual([port]);
    expect(server.listening).toBe(true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  expect(await occupiedPorts([port])).toEqual([]);
});
function mockStatus(
  change: (value: ReturnType<typeof sandboxStatus>) => unknown,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const port = Number(new URL(url).port),
        id = ["alice", "bob", "cara", "drew"][port - 5180];
      return Response.json(change(sandboxStatus(id, false)));
    }),
  );
}
it("recognizes a complete sandbox instance from this workspace", async () => {
  mockStatus((value) => value);
  expect((await existingSandbox())?.pid).toBe(process.pid);
});
it("rejects another workspace and inconsistent instance identifiers", async () => {
  mockStatus((value) => ({ ...value, workspace: "/a/different/project" }));
  expect(await existingSandbox()).toBeNull();
  mockStatus((value) => ({
    ...value,
    pid: value.profile === "alice" ? value.pid : value.pid + 1,
  }));
  expect(await existingSandbox()).toBeNull();
});
it("does not mistake a normal app or partial startup for an existing sandbox", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "ok" })),
  );
  expect(await existingSandbox()).toBeNull();
});
