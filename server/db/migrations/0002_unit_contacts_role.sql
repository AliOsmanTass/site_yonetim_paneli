ALTER TABLE `unit_contacts` DROP COLUMN `is_primary`;
--> statement-breakpoint
ALTER TABLE `unit_contacts` ADD COLUMN `role` text NOT NULL DEFAULT 'malik';
