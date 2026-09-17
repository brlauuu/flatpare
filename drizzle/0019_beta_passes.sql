CREATE TABLE `beta_pass_redemptions` (
	`pass_id` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`pass_id`) REFERENCES `beta_passes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `beta_passes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label` text,
	`credits` integer DEFAULT 40 NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_passes_code_unique` ON `beta_passes` (`code`);