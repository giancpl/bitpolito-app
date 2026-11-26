CREATE TABLE `android_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `android_devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `push_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `android_delivery_job_device` ON `android_deliveries` (`job_id`,`device_id`);--> statement-breakpoint
CREATE TABLE `android_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`pubkey` text NOT NULL,
	`session_hash` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pubkey`) REFERENCES `users`(`pubkey`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_hash`) REFERENCES `sessions`(`token`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `android_devices_token_unique` ON `android_devices` (`token`);--> statement-breakpoint
ALTER TABLE `challenges` ADD `client` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `client` text DEFAULT 'web' NOT NULL;