import { z } from "zod";

export const pubkeySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const profileSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  about: z.string().max(500).default(""),
});
export const resourceSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  type: z.enum(["tool", "resource"]),
  category: z.string().trim().min(1).max(60),
  url: z.url({ protocol: /^https?$/ }),
  status: z.enum(["active", "archived"]).default("active"),
});

export type Role = "follower" | "member" | "admin";
export interface User {
  id: string;
  name: string;
  about: string;
  role: Role;
}
export interface Resource extends z.infer<typeof resourceSchema> {
  id: string;
  icon: string;
  updatedAt: number;
}
export interface Invite {
  id: string;
  label: string;
  expiresAt: number;
  usedAt: number | null;
  revokedAt: number | null;
}
export interface Presence {
  id: string;
  name: string;
  expiresAt: number;
}
export type RequestStatus = "waiting" | "claimed" | "resolved" | "cancelled" | "expired";
export interface MooRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  status: RequestStatus;
  createdAt: number;
  expiresAt: number;
  /** Everyone currently on their way; older runtimes report a single claimer instead. */
  responders?: { id: string; name: string; until: number }[];
  claimedBy: string | null;
  claimerName: string | null;
  claimUntil: number | null;
  resolvedReason: "opened" | "inside" | null;
  updatedAt: number;
}
export interface MooState {
  office: string;
  serverTime: number;
  presence: Presence[];
  own: MooRequest | null;
  incoming: MooRequest[];
}
