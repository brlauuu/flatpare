DROP TABLE IF EXISTS `app_settings`;--> statement-breakpoint
DROP TABLE IF EXISTS `apartment_distances`;--> statement-breakpoint
DROP TABLE IF EXISTS `ratings`;--> statement-breakpoint
DROP TABLE IF EXISTS `locations_of_interest`;--> statement-breakpoint
DROP TABLE IF EXISTS `apartments`;--> statement-breakpoint
CREATE TABLE `apartments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `apartments_household_idx` ON `apartments` (`household_id`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`household_id` integer NOT NULL,
	`apartment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`apartment_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `ratings_household_idx` ON `ratings` (`household_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `locations_household_idx` ON `locations` (`household_id`);
