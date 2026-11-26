import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  pubkey: text("pubkey").primaryKey(),
  name: text("name").notNull().default(""),
  about: text("about").notNull().default(""),
  role: text("role", { enum: ["follower", "member", "admin"] })
    .notNull()
    .default("follower"),
  createdAt: integer("created_at").notNull(),
});
export const challenges = sqliteTable("challenges", {
  nonce: text("nonce").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  client: text("client").notNull().default("web"),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  pubkey: text("pubkey")
    .notNull()
    .references(() => users.pubkey),
  expiresAt: integer("expires_at").notNull(),
  client: text("client").notNull().default("web"),
});
export const applications = sqliteTable("applications", {
  pubkey: text("pubkey")
    .primaryKey()
    .references(() => users.pubkey),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
});
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  pubkey: text("pubkey").notNull(),
  kind: integer("kind").notNull(),
  createdAt: integer("created_at").notNull(),
  raw: text("raw").notNull(),
  hidden: integer("hidden").notNull().default(0),
  coordinate: text("coordinate"),
  target: text("target"),
});
export const outbox = sqliteTable(
  "outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    relay: text("relay").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttempt: integer("next_attempt").notNull().default(0),
    lastError: text("last_error"),
    acknowledgedAt: integer("acknowledged_at"),
  },
  (table) => [uniqueIndex("outbox_event_relay").on(table.eventId, table.relay)],
);
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  url: text("url").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  start: integer("start").notNull(),
  end: integer("end").notNull(),
  location: text("location").notNull().default(""),
  agenda: text("agenda").notNull().default(""),
  notes: text("notes").notNull().default(""),
  attendees: text("attendees").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const meetingResponses = sqliteTable(
  "meeting_responses",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    pubkey: text("pubkey")
      .notNull()
      .references(() => users.pubkey),
    status: text("status").notNull(),
  },
  (table) => [uniqueIndex("meeting_person").on(table.meetingId, table.pubkey)],
);
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  assignee: text("assignee").references(() => users.pubkey),
  dueDate: text("due_date"),
  status: text("status").notNull().default("todo"),
  meetingId: text("meeting_id").references(() => meetings.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const activity = sqliteTable("activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pubkey: text("pubkey").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Hub tables are additive: earlier projects, events and identities remain intact.
export const resources = sqliteTable("resources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  type: text("type").notNull(),
  category: text("category").notNull(),
  url: text("url").notNull(),
  status: text("status").notNull().default("active"),
  icon: text("icon").notNull().default("icon-linkedin.svg"),
  updatedAt: integer("updated_at").notNull(),
});
export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedBy: text("used_by"),
  usedAt: integer("used_at"),
  revokedAt: integer("revoked_at"),
});
export const presence = sqliteTable("presence", {
  pubkey: text("pubkey")
    .primaryKey()
    .references(() => users.pubkey),
  expiresAt: integer("expires_at").notNull(),
  reminded: integer("reminded").notNull().default(0),
});
export const mooRequests = sqliteTable(
  "moo_requests",
  {
    id: text("id").primaryKey(),
    requester: text("requester")
      .notNull()
      .references(() => users.pubkey),
    operationKey: text("operation_key").notNull(),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    claimedBy: text("claimed_by").references(() => users.pubkey),
    claimUntil: integer("claim_until"),
    resolvedReason: text("resolved_reason"),
    reminded: integer("reminded").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("moo_operation").on(t.requester, t.operationKey)],
);
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  pubkey: text("pubkey")
    .notNull()
    .references(() => users.pubkey),
  sessionHash: text("session_hash").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const pushJobs = sqliteTable("push_jobs", {
  id: text("id").primaryKey(),
  pubkey: text("pubkey").notNull(),
  purpose: text("purpose").notNull(),
  reference: text("reference").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttempt: integer("next_attempt").notNull(),
  lastError: text("last_error"),
});
export const androidDevices = sqliteTable("android_devices", {
  id: text("id").primaryKey(),
  pubkey: text("pubkey").notNull().references(() => users.pubkey),
  sessionHash: text("session_hash").notNull().references(() => sessions.token, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});
export const androidDeliveries = sqliteTable("android_deliveries", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => androidDevices.id, { onDelete: "cascade" }),
  jobId: text("job_id").notNull().references(() => pushJobs.id),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttempt: integer("next_attempt").notNull().default(0),
}, (t) => [uniqueIndex("android_delivery_job_device").on(t.jobId, t.deviceId)]);
