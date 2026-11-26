CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` text,
	`used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `moo_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requester` text NOT NULL,
	`operation_key` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_by` text,
	`claim_until` integer,
	`resolved_reason` text,
	`reminded` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`requester`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claimed_by`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moo_operation` ON `moo_requests` (`requester`,`operation_key`);--> statement-breakpoint
CREATE TABLE `presence` (
	`pubkey` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`reminded` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`pubkey`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `push_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`pubkey` text NOT NULL,
	`purpose` text NOT NULL,
	`reference` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`pubkey` text NOT NULL,
	`session_hash` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pubkey`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`icon` text DEFAULT 'icon-linkedin.svg' NOT NULL,
	`updated_at` integer NOT NULL
);
