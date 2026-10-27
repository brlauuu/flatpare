CREATE TABLE `apartment_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`created_by` text,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `apartment_drafts_household_idx` ON `apartment_drafts` (`household_id`);