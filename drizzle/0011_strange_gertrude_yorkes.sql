CREATE TABLE `accounts` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `household_members` (
	`household_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`household_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
DROP INDEX `ratings_apartment_user_idx`;--> statement-breakpoint
ALTER TABLE `ratings` ADD `household_id` integer NOT NULL REFERENCES households(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `ratings` ADD `user_id` text NOT NULL REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX `ratings_apartment_user_idx` ON `ratings` (`apartment_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `ratings` DROP COLUMN `user_name`;--> statement-breakpoint
-- The old `users` table (name text primary key, created_at) shares no
-- columns with the new Auth.js shape (id, name, email, email_verified,
-- image), so there is nothing to carry forward via INSERT INTO ... SELECT
-- (those source columns do not exist on the old table). The production
-- database is being wiped for this migration anyway; drop and recreate.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`email_verified` integer,
	`image` text
);
--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `apartment_distances` ADD `household_id` integer NOT NULL REFERENCES households(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `apartments` ADD `household_id` integer NOT NULL REFERENCES households(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `household_id` integer REFERENCES households(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `locations_of_interest` ADD `household_id` integer NOT NULL REFERENCES households(id) ON DELETE cascade;