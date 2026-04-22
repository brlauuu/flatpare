CREATE TABLE IF NOT EXISTS `apartments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`size_m2` real,
	`num_rooms` real,
	`num_bathrooms` integer,
	`num_balconies` integer,
	`has_washing_machine` integer,
	`rent_chf` real,
	`distance_bike_min` integer,
	`distance_transit_min` integer,
	`pdf_url` text,
	`listing_url` text,
	`raw_extracted_data` text,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service` text NOT NULL,
	`operation` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`apartment_id` integer NOT NULL,
	`user_name` text NOT NULL,
	`kitchen` integer DEFAULT 0,
	`balconies` integer DEFAULT 0,
	`location` integer DEFAULT 0,
	`floorplan` integer DEFAULT 0,
	`overall_feeling` integer DEFAULT 0,
	`comment` text DEFAULT '',
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ratings_apartment_user_idx` ON `ratings` (`apartment_id`,`user_name`);
