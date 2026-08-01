CREATE TABLE `app_stats` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leaderboard` (
	`name` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leaderboard_score` ON `leaderboard` (`score`,`updated_at`);--> statement-breakpoint
CREATE TABLE `score_reporters` (
	`nickname` text PRIMARY KEY NOT NULL,
	`report_count` integer DEFAULT 0 NOT NULL
);
