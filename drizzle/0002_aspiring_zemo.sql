DROP INDEX "glosses_sense_idx";--> statement-breakpoint
DROP INDEX "kanji_forms_entry_idx";--> statement-breakpoint
DROP INDEX "readings_entry_idx";--> statement-breakpoint
ALTER TABLE "glosses" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "kanji_forms" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "readings" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "search_terms" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_sense_id_ord_pk" PRIMARY KEY("sense_id","ord");--> statement-breakpoint
ALTER TABLE "kanji_forms" ADD CONSTRAINT "kanji_forms_entry_id_ord_pk" PRIMARY KEY("entry_id","ord");--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_entry_id_ord_pk" PRIMARY KEY("entry_id","ord");
