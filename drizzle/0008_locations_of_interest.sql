CREATE TABLE `locations_of_interest` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`icon` text NOT NULL,
	`address` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `apartment_distances` (
	`apartment_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`bike_min` integer,
	`transit_min` integer,
	`updated_at` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`apartment_id`, `location_id`),
	FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations_of_interest`(`id`) ON UPDATE no action ON DELETE cascade
);
