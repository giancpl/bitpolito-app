import { createServer } from "node:net";
import { resolve } from "node:path";
import { sandboxOrigin, sandboxProfiles } from "../shared/sandbox.js";

export const sandboxPorts = [
  ...sandboxProfiles.map((_, index) => 3180 + index),
  ...sandboxProfiles.map((profile) => profile.port),
];
export const sandboxStatus = (profile: string, temporary: boolean) => ({
  app: "bitpolito-local-sandbox",
  workspace: resolve("."),
  pid: process.pid,
  profile,
  temporary,
});
export async function occupiedPorts(ports = sandboxPorts) {
  const results = await Promise.all(
    ports.map(
      (port) =>
        new Promise<number | null>((resolve, reject) => {
          const server = createServer();
          server.once("error", (error: NodeJS.ErrnoException) =>
            error.code === "EADDRINUSE" ? resolve(port) : reject(error),
          );
          server.listen({ host: "127.0.0.1", port }, () =>
            server.close((error) => (error ? reject(error) : resolve(null))),
          );
        }),
    ),
  );
  return results.filter((port): port is number => port !== null);
}
export async function existingSandbox() {
  try {
    const states = await Promise.all(
      sandboxProfiles.map(async (profile) => {
        const response = await fetch(
          `${sandboxOrigin(profile)}/__sandbox/status`,
          { signal: AbortSignal.timeout(1500), redirect: "error" },
        );
        if (!response.ok) throw Error("Unavailable");
        const value = await response.json();
        if (
          value.app !== "bitpolito-local-sandbox" ||
          value.workspace !== resolve(".") ||
          value.profile !== profile.id ||
          !Number.isInteger(value.pid) ||
          value.pid <= 1
        )
          throw Error("Different service");
        return value as ReturnType<typeof sandboxStatus>;
      }),
    );
    if (
      !states.every(
        (state) =>
          state.pid === states[0].pid &&
          state.temporary === states[0].temporary,
      )
    )
      return null;
    return states[0];
  } catch {
    return null;
  }
}
export function sandboxLinks() {
  for (const profile of sandboxProfiles)
    console.log(
      `${profile.name} (${profile.role === "follower" ? "needs invitation" : profile.role}): ${sandboxOrigin(profile)}`,
    );
}
