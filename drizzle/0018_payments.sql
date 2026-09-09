CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`stripe_customer` text,
	`stripe_session` text,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`credits_granted` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
