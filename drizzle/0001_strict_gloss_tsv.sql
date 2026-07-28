-- A stored generated column's expression cannot be altered in place, so the
-- column is dropped and rebuilt with the `simple` config. Dropping it also
-- drops "entry_search_tsv_idx" with it — drizzle-kit does not emit that, since
-- its snapshot only sees the column change, so recreate the index by hand.
ALTER TABLE "entry_search" drop column "gloss_tsv";--> statement-breakpoint
ALTER TABLE "entry_search" ADD COLUMN "gloss_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "entry_search"."gloss_blob")) STORED;--> statement-breakpoint
CREATE INDEX "entry_search_tsv_idx" ON "entry_search" USING gin ("gloss_tsv");