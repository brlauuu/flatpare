CREATE TABLE `process_usage` (
	`household_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`household_id`, `endpoint`, `window_start`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
