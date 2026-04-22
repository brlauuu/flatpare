ALTER TABLE `apartments` ADD `short_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `apartments_short_code_unique` ON `apartments` (`short_code`);