CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pubkey` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`pubkey` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pubkey`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`pubkey` text NOT NULL,
	`kind` integer NOT NULL,
	`created_at` integer NOT NULL,
	`raw` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`coordinate` text,
	`target` text
);
--> statement-breakpoint
CREATE TABLE `meeting_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`pubkey` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pubkey`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_person` ON `meeting_responses` (`meeting_id`,`pubkey`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`agenda` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`attendees` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`relay` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`acknowledged_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_event_relay` ON `outbox` (`event_id`,`relay`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`pubkey` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`pubkey`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`assignee` text,
	`due_date` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`meeting_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `users` (
	`pubkey` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`about` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'follower' NOT NULL,
	`created_at` integer NOT NULL
);
