CREATE TABLE "review_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"entry_id" bigint NOT NULL,
	"rating" smallint NOT NULL,
	"state" smallint NOT NULL,
	"prev_review_at" timestamp with time zone,
	"stability" real,
	"difficulty" real,
	"scheduled_days" integer,
	"learning_steps" smallint,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_words" ADD COLUMN "stability" real;--> statement-breakpoint
ALTER TABLE "user_words" ADD COLUMN "difficulty" real;--> statement-breakpoint
ALTER TABLE "user_words" ADD COLUMN "state" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_words" ADD COLUMN "learning_steps" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_words" ADD COLUMN "last_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_log_user_time_idx" ON "review_log" USING btree ("user_id","reviewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "review_log_card_idx" ON "review_log" USING btree ("user_id","entry_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "user_words_due_idx" ON "user_words" USING btree ("user_id","status","due_at");--> statement-breakpoint
-- Backfill, hand-added: the review query is `due_at <= now()` with no NULL
-- branch, so every existing row needs one. A word saved and never reviewed is
-- due from the moment it was saved.
UPDATE "user_words" SET "due_at" = "added_at" WHERE "due_at" IS NULL;