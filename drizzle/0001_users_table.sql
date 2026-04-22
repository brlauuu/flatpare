CREATE TABLE IF NOT EXISTS `users` (
	`name` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`name`)
  SELECT DISTINCT `user_name` FROM `ratings`;
