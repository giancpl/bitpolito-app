import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SIGNER_RELAY, readConfig } from "../server/config.js";

afterEach(() => vi.unstubAllEnvs());

it("uses the public signer relay when no relay setting exists", () => {
  vi.stubEnv("RELAY_URLS", undefined);
  expect(readConfig().relays).toEqual([DEFAULT_SIGNER_RELAY]);
});

it("preserves explicit opt-out and local relay overrides", () => {
  vi.stubEnv("RELAY_URLS", "");
  expect(readConfig().relays).toEqual([]);
  vi.stubEnv("RELAY_URLS", " ws://127.0.0.1:7001, wss://example.com , ");
  expect(readConfig().relays).toEqual([
    "ws://127.0.0.1:7001",
    "wss://example.com",
  ]);
  expect(readConfig({ relays: [] }).relays).toEqual([]);
});

it("rejects insecure external relay overrides", () => {
  vi.stubEnv("RELAY_URLS", "ws://example.com");
  expect(() => readConfig()).toThrow(/wss:\/\//);
});
