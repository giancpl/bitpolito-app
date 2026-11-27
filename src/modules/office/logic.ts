import type { MooRequest } from "../../../shared/contracts";

/** Pure office wording and state helpers, shared by views and unit tests. */
export const isLive = (r: MooRequest) => r.status === "waiting" || r.status === "claimed";

export const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export const joinNames = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** Everyone on their way; older runtimes report only a single claimer. */
export function responders(r: MooRequest) {
  if (r.responders) return r.responders;
  return r.claimedBy ? [{ id: r.claimedBy, name: r.claimerName || "A teammate", until: 0 }] : [];
}

export function requestTitle(r: MooRequest, user: string, inside = true) {
  const mine = r.requesterId === user;
  if (r.status === "waiting")
    return mine
      ? "Waiting for someone to respond"
      : `${r.requesterName || "Someone"} is at the door`;
  if (r.status === "claimed") {
    const coming = responders(r);
    if (coming.some((p) => p.id === user)) return "You’re getting the door";
    if (!coming.length) return "A teammate is coming";
    return `${joinNames(coming.map((p) => p.name))} ${coming.length === 1 ? "is" : "are"} coming`;
  }
  if (r.status === "resolved")
    return r.resolvedReason === "inside"
      ? inside && mine
        ? "You’re inside. Welcome!"
        : "Entry confirmed"
      : "The door has been opened";
  return r.status === "cancelled" ? "Request cancelled" : "No response in time";
}
