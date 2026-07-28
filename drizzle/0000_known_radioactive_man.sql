-- Hand-added: `search_terms_trgm_idx` below uses gin_trgm_ops, which does not
-- exist until pg_trgm is installed. Available on Neon by default.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" bigint PRIMARY KEY NOT NULL,
	"is_common" boolean DEFAULT false NOT NULL,
	"freq_rank" integer
);
--> statement-breakpoint
CREATE TABLE "entry_search" (
	"entry_id" bigint PRIMARY KEY NOT NULL,
	"headword" text NOT NULL,
	"reading" text NOT NULL,
	"romaji" text NOT NULL,
	"gloss_summary" text NOT NULL,
	"gloss_blob" text NOT NULL,
	"is_common" boolean DEFAULT false NOT NULL,
	"freq_rank" integer,
	"gloss_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "entry_search"."gloss_blob")) STORED
);
--> statement-breakpoint
CREATE TABLE "furigana" (
	"kanji_text" text NOT NULL,
	"reading_kana" text NOT NULL,
	"ruby" jsonb NOT NULL,
	CONSTRAINT "furigana_kanji_text_reading_kana_pk" PRIMARY KEY("kanji_text","reading_kana")
);
--> statement-breakpoint
CREATE TABLE "glosses" (
	"id" bigint PRIMARY KEY NOT NULL,
	"sense_id" bigint NOT NULL,
	"text" text NOT NULL,
	"lang" text DEFAULT 'eng' NOT NULL,
	"type" text,
	"ord" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji_forms" (
	"id" bigint PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"text" text NOT NULL,
	"is_common" boolean DEFAULT false NOT NULL,
	"ord" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" bigint PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"kana" text NOT NULL,
	"romaji" text NOT NULL,
	"no_kanji" boolean DEFAULT false NOT NULL,
	"restrictions" text[],
	"is_common" boolean DEFAULT false NOT NULL,
	"ord" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_terms" (
	"id" bigint PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"term" text NOT NULL,
	"term_type" text NOT NULL,
	"weight" smallint DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "senses" (
	"id" bigint PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"ord" smallint NOT NULL,
	"pos" text[],
	"field" text[],
	"misc" text[],
	"dialect" text[],
	"info" text
);
--> statement-breakpoint
CREATE TABLE "user_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"entry_id" bigint NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"learned_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"interval_days" integer,
	"ease" real,
	"repetitions" integer,
	"lapses" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"front_mode" text DEFAULT 'kanji' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_search" ADD CONSTRAINT "entry_search_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_sense_id_senses_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_forms" ADD CONSTRAINT "kanji_forms_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_terms" ADD CONSTRAINT "search_terms_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "senses" ADD CONSTRAINT "senses_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_words" ADD CONSTRAINT "user_words_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_common_idx" ON "entries" USING btree ("is_common","freq_rank");--> statement-breakpoint
CREATE INDEX "entry_search_tsv_idx" ON "entry_search" USING gin ("gloss_tsv");--> statement-breakpoint
CREATE INDEX "entry_search_rank_idx" ON "entry_search" USING btree ("is_common","freq_rank");--> statement-breakpoint
CREATE INDEX "glosses_sense_idx" ON "glosses" USING btree ("sense_id");--> statement-breakpoint
CREATE INDEX "kanji_forms_entry_idx" ON "kanji_forms" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "readings_entry_idx" ON "readings" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "search_terms_prefix_idx" ON "search_terms" USING btree ("term" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "search_terms_trgm_idx" ON "search_terms" USING gin ("term" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "search_terms_entry_idx" ON "search_terms" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "senses_entry_idx" ON "senses" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_words_user_entry_idx" ON "user_words" USING btree ("user_id","entry_id");--> statement-breakpoint
CREATE INDEX "user_words_list_idx" ON "user_words" USING btree ("user_id","status","added_at" DESC NULLS LAST);