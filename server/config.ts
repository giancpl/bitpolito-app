import "dotenv/config";
import { resolve } from "node:path";
export const DEFAULT_SIGNER_RELAY = "wss://nrs.primal.net";
export const isLoopback = (hostname: string) =>
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
export interface Config {
  dataDir: string;
  origin: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  host: string;
  port: number;
  relays: string[];
  pushPublicKey: string;
  pushPrivateKey: string;
  pushSubject: string;
}
export function readConfig(overrides: Partial<Config> = {}): Config {
  const config = {
    dataDir: resolve(process.env.DATA_DIR || "./data"),
    origin: process.env.APP_ORIGIN || "http://localhost:5173",
    cookieSecure: process.env.COOKIE_SECURE === "true",
    trustProxy: process.env.TRUST_PROXY === "true",
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 3001),
    relays: (process.env.RELAY_URLS ?? DEFAULT_SIGNER_RELAY)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    pushPublicKey: process.env.VAPID_PUBLIC_KEY || "",
    pushPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
    pushSubject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    ...overrides,
  };
  const origin = new URL(config.origin);
  if (
    origin.origin !== config.origin ||
    !["http:", "https:"].includes(origin.protocol) ||
    (!isLoopback(origin.hostname) && origin.protocol !== "https:")
  )
    throw Error(
      "APP_ORIGIN must be HTTPS (HTTP is allowed only on localhost), without a trailing slash",
    );
  if (origin.protocol === "https:" && !config.cookieSecure)
    throw Error("HTTPS requires COOKIE_SECURE=true");
  if (
    config.relays.some((url) => {
      try {
        return (
          !["ws:", "wss:"].includes(new URL(url).protocol) ||
          (!isLoopback(new URL(url).hostname) && !url.startsWith("wss:"))
        );
      } catch {
        return true;
      }
    })
  )
    throw Error(
      "Remote signer relays require wss:// (ws:// is allowed locally)",
    );
  if (!!config.pushPublicKey !== !!config.pushPrivateKey)
    throw Error("Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY");
  return config;
}
