ALTER TABLE `household_key_wraps` ADD `key_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `key_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `rotation_due` integer DEFAULT false NOT NULL;