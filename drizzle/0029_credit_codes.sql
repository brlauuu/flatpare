CREATE TABLE `credit_code_redemptions` (
	`code_id` integer NOT NULL,
	`household_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`code_id`, `household_id`),
	FOREIGN KEY (`code_id`) REFERENCES `credit_codes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label` text,
	`credits` integer NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_codes_code_unique` ON `credit_codes` (`code`);