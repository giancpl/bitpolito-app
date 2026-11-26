import { describe, expect, it } from "vitest";
import { joinNames, people, requestTitle } from "../src/lib/office";
import type { MooRequest } from "../shared/contracts";

const base: MooRequest = {
  id: "r1",
  requesterId: "cara",
  requesterName: "Cara",
  status: "waiting",
  createdAt: 0,
  expiresAt: 180,
  claimedBy: null,
  claimerName: null,
  claimUntil: null,
  resolvedReason: null,
  updatedAt: 0,
};
const request = (patch: Partial<MooRequest>) => ({ ...base, ...patch });

describe("requestTitle", () => {
  it("names who is at the door for responders", () => {
    expect(requestTitle(base, "alice")).toBe("Cara is at the door");
    expect(requestTitle(request({ requesterName: "" }), "alice")).toBe("Someone is at the door");
  });
  it("tells the requester they are waiting", () => {
    expect(requestTitle(base, "cara")).toBe("Waiting for someone to respond");
  });
  it("lists every responder on their way", () => {
    const responders = [
      { id: "alice", name: "Alice", until: 1 },
      { id: "bob", name: "Bob", until: 1 },
    ];
    const claimed = request({ status: "claimed", responders });
    expect(requestTitle(claimed, "cara")).toBe("Alice and Bob are coming");
    expect(requestTitle(claimed, "bob")).toBe("You’re getting the door");
    expect(
      requestTitle(request({ status: "claimed", responders: responders.slice(0, 1) }), "cara"),
    ).toBe("Alice is coming");
  });
  it("falls back to the single claimer reported by older runtimes", () => {
    const claimed = request({ status: "claimed", claimedBy: "bob", claimerName: "Bob" });
    expect(requestTitle(claimed, "cara")).toBe("Bob is coming");
  });
  it("never renders an empty responder list", () => {
    expect(requestTitle(request({ status: "claimed", responders: [] }), "cara")).toBe(
      "A teammate is coming",
    );
  });
  it("confirms entry depending on who is looking", () => {
    const resolved = request({ status: "resolved", resolvedReason: "inside" });
    expect(requestTitle(resolved, "cara", true)).toBe("You’re inside. Welcome!");
    expect(requestTitle(resolved, "cara", false)).toBe("Entry confirmed");
    expect(requestTitle(resolved, "alice", true)).toBe("Entry confirmed");
  });
  it("describes ended requests", () => {
    expect(requestTitle(request({ status: "cancelled" }), "cara")).toBe("Request cancelled");
    expect(requestTitle(request({ status: "expired" }), "cara")).toBe("No response in time");
  });
});

describe("wording helpers", () => {
  it("joins names naturally", () => {
    expect(joinNames(["Alice"])).toBe("Alice");
    expect(joinNames(["Alice", "Bob", "Cara"])).toBe("Alice, Bob and Cara");
  });
  it("pluralises people", () => {
    expect(people(1)).toBe("1 person");
    expect(people(3)).toBe("3 people");
  });
});
