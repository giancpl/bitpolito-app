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
export const signedEventSchema = z.object({
  id: pubkeySchema,
  pubkey: pubkeySchema,
  created_at: z.number().int(),
  kind: z.number().int(),
  content: z.string().max(4096),
  tags: z.array(z.array(z.string().max(4096)).max(10)).max(30),
  sig: z.string().regex(/^[a-f0-9]{128}$/),
});
export const inviteTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const authSchema = z.strictObject({
  challenge: inviteTokenSchema,
  name: z.string().trim().min(1).max(60).optional(),
  invite: inviteTokenSchema.optional(),
});
// Legacy action names remain parseable only so the server can return explicit 410 errors.
export const presenceSchema = z.strictObject({
  action: z.enum(["arrive", "extend", "leave"]),
});
export const ringSchema = z.strictObject({ key: z.string().uuid() });
export const requestActionSchema = z.strictObject({
  action: z.enum(["claim", "release", "opened", "inside", "cancel"]),
});
export const pushSchema = z.strictObject({
  endpoint: z.url().max(4096),
  keys: z.strictObject({
    p256dh: z.string().regex(/^[\w-]{87}$/),
    auth: z.string().regex(/^[\w-]{22}$/),
  }),
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
export type RequestStatus =
  | "waiting"
  | "claimed"
  | "resolved"
  | "cancelled"
  | "expired";
export interface MooRequest {
  responders?: {id:string;name:string;until:number}[];
  id: string;
  requesterId: string;
  requesterName: string;
  status: RequestStatus;
  createdAt: number;
  expiresAt: number;
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
export interface AppConfig {
  signerRelays?: string[];
  timezone: string;
  relays: string[];
  pushPublicKey: string | null;
}

// Android registration is separate from Web Push and is scoped to a native session.
export const androidDeviceSchema = z.strictObject({
  installationId: z.string().uuid(),
  token: z.string().min(20).max(4096),
});
export interface AndroidPushStatus { configured: boolean; subscribed: boolean; }
