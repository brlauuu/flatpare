CREATE TABLE `household_key_wraps` (
	`household_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`wrapped_key` text NOT NULL,
	`wrapped_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`household_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wrapped_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_by` text,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_pending_household_email` ON `invitations` (`household_id`,`email`) WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE `member_keys` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`wrapped_private_key` text NOT NULL,
	`private_key_iv` text NOT NULL,
	`kdf_salt` text NOT NULL,
	`kdf_memory_kib` integer NOT NULL,
	`kdf_iterations` integer NOT NULL,
	`kdf_parallelism` integer NOT NULL,
	`kdf_version` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_wrapped_key` text;--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_iv` text;--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_kdf_salt` text;--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_kdf_memory_kib` integer;--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_kdf_iterations` integer;--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_kdf_parallelism` integer;--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_kdf_version` integer;--> statement-breakpoint
ALTER TABLE `households` ADD `recovery_created_at` integer;