import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "web" },
  registerPlugin: () => ({}),
}));
const { inviteLink, inviteToken } = await import("../src/lib/hub");

describe("inviteToken", () => {
  it("accepts a bare code", () => {
    expect(inviteToken("  abc123  ")).toBe("abc123");
  });
  it("extracts the token from app and web links", () => {
    expect(inviteToken("bitpolito://join#invite=abc123")).toBe("abc123");
    expect(inviteToken("https://example.org/#invite=abc123&x=1")).toBe("abc123");
  });
  it("round-trips the links administrators share", () => {
    expect(inviteToken(inviteLink("tok_-9"))).toBe("tok_-9");
  });
});
