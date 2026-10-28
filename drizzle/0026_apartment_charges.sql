CREATE TABLE `apartment_charges` (
	`household_id` integer NOT NULL,
	`apartment_id` text NOT NULL,
	`charged_at` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`household_id`, `apartment_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Every apartment that exists was paid for when it was created (the old rule),
-- so its first processing is already charged.
INSERT INTO `apartment_charges` (`household_id`, `apartment_id`, `charged_at`)
SELECT `household_id`, `id`, `created_at` FROM `apartments`;
