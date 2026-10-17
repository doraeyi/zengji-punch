CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`label` varchar(120) NOT NULL DEFAULT '',
	`created_at` datetime NOT NULL,
	`last_seen_at` datetime NOT NULL,
	`revoked_at` datetime,
	`revoke_reason` varchar(40),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_token_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`username` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('owner','staff') NOT NULL DEFAULT 'staff',
	`color` varchar(16) NOT NULL DEFAULT '#c2410c',
	`active` boolean NOT NULL DEFAULT true,
	`hourly_wage` int NOT NULL DEFAULT 0,
	`seen_notification_id` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_username_uq` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(20) NOT NULL,
	`employee_id` int,
	`text` varchar(255) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`amount` int NOT NULL,
	`method` enum('monthly','weekly','other') NOT NULL,
	`note` text,
	`paid_at` datetime NOT NULL,
	`created_by` int NOT NULL,
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `punches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`kind` enum('in','out') NOT NULL,
	`at` datetime NOT NULL,
	`device_id` int,
	`source` varchar(20) NOT NULL DEFAULT 'app',
	`distance` int,
	CONSTRAINT `punches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`p256dh` varchar(200) NOT NULL,
	`auth` varchar(100) NOT NULL,
	`label` varchar(120) NOT NULL DEFAULT '',
	`created_at` datetime NOT NULL,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_endpoint_uq` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`day` date NOT NULL,
	`kind` varchar(20) NOT NULL,
	`sent_at` datetime NOT NULL,
	CONSTRAINT `reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `reminders_uq` UNIQUE(`employee_id`,`day`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(50) NOT NULL,
	`value` json NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `shift_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`weekday` int NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	CONSTRAINT `shift_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `shift_templates_emp_day_uq` UNIQUE(`employee_id`,`weekday`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`day` date NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	`note` varchar(100),
	`leave` boolean NOT NULL DEFAULT false,
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `devices` ADD CONSTRAINT `devices_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `punches` ADD CONSTRAINT `punches_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminders` ADD CONSTRAINT `reminders_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_templates` ADD CONSTRAINT `shift_templates_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `devices_employee_idx` ON `devices` (`employee_id`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `payouts_employee_idx` ON `payouts` (`employee_id`);--> statement-breakpoint
CREATE INDEX `punches_employee_at_idx` ON `punches` (`employee_id`,`at`);--> statement-breakpoint
CREATE INDEX `push_employee_idx` ON `push_subscriptions` (`employee_id`);--> statement-breakpoint
CREATE INDEX `shifts_day_idx` ON `shifts` (`day`);