import { type SQL, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Postgres `tsvector`. Drizzle has no built-in, so declare it once here. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** One aligned furigana segment, e.g. `{ ruby: "猫", rt: "ねこ" }`. */
export type RubySegment = { ruby: string; rt: string };

/* ------------------------------------------------------------------ *
 * Dictionary — immutable, written only by scripts/import-jmdict.ts.
 *
 * Most tables are keyed by their natural key — (entry_id, ord) or
 * (sense_id, ord) — so the primary key is also the lookup index. The one
 * surrogate key, senses.id, is a plain bigint assigned by the importer rather
 * than an identity column: bulk loading ~1.5M rows otherwise means
 * `RETURNING id` on every batch just to link glosses to their sense; a counter
 * in the script lets every table be inserted as one flat batched pass.
 * ------------------------------------------------------------------ */

export const entries = pgTable(
  "entries",
  {
    /** JMdict `ent_seq`. Stable across JMdict releases, so we reuse it as PK. */
    id: bigint("id", { mode: "number" }).primaryKey(),
    /** True when any kanji/reading carries a news/ichi/spec/gai priority tag. */
    isCommon: boolean("is_common").notNull().default(false),
    /** Lower is more frequent; null when JMdict gives no frequency signal. */
    freqRank: integer("freq_rank"),
  },
  (t) => [index("entries_common_idx").on(t.isCommon, t.freqRank)],
);

export const kanjiForms = pgTable(
  "kanji_forms",
  {
    entryId: bigint("entry_id", { mode: "number" })
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** The `<keb>` surface form, e.g. 猫. */
    text: text("text").notNull(),
    isCommon: boolean("is_common").notNull().default(false),
    /** Position within the entry; 0 is the headword. */
    ord: smallint("ord").notNull(),
  },
  // The natural key doubles as the entry_id lookup index.
  (t) => [primaryKey({ columns: [t.entryId, t.ord] })],
);

export const readings = pgTable(
  "readings",
  {
    entryId: bigint("entry_id", { mode: "number" })
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** The `<reb>` kana form, e.g. ねこ. */
    kana: text("kana").notNull(),
    /** Hepburn romaji derived from `kana` at import time via wanakana. */
    romaji: text("romaji").notNull(),
    /** `<re_nokanji/>`: this reading is not a reading of any kanji form. */
    noKanji: boolean("no_kanji").notNull().default(false),
    /** `<re_restr>`: limits this reading to specific kanji forms. */
    restrictions: text("restrictions").array(),
    isCommon: boolean("is_common").notNull().default(false),
    ord: smallint("ord").notNull(),
  },
  // The natural key doubles as the entry_id lookup index.
  (t) => [primaryKey({ columns: [t.entryId, t.ord] })],
);

export const senses = pgTable(
  "senses",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey(),
    entryId: bigint("entry_id", { mode: "number" })
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    ord: smallint("ord").notNull(),
    /*
     * Short JMdict entity names, not the expanded descriptions: `["n","vs"]`
     * rather than `["noun (common) (futsuumeishi)", ...]`. Storing the tag keeps
     * these arrays small across ~200k rows; lib/dictionary/tags.ts maps them
     * back to display names.
     */
    pos: text("pos").array(),
    field: text("field").array(),
    misc: text("misc").array(),
    dialect: text("dialect").array(),
    /** `<s_inf>` free-text note. */
    info: text("info"),
  },
  (t) => [index("senses_entry_idx").on(t.entryId)],
);

export const glosses = pgTable(
  "glosses",
  {
    senseId: bigint("sense_id", { mode: "number" })
      .notNull()
      .references(() => senses.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** ISO 639-2. JMdict_e is English-only, but the column keeps the door open. */
    lang: text("lang").notNull().default("eng"),
    /** `g_type`: "expl" | "lit" | "fig" | "tm". */
    type: text("type"),
    ord: smallint("ord").notNull(),
  },
  // The natural key doubles as the sense_id lookup index.
  (t) => [primaryKey({ columns: [t.senseId, t.ord] })],
);

/**
 * Kanji→reading alignments from the JmdictFurigana dataset.
 *
 * Deliberately keyed by the (surface, reading) pair rather than by entry: an
 * alignment is a property of the pair itself, and the same pair can appear
 * under more than one JMdict entry. Keying by entry would force a k×r join at
 * import time and make a unique index on the pair unsatisfiable. As a standalone
 * table the import is a straight dump, and lookups are primary-key hits.
 */
export const furigana = pgTable(
  "furigana",
  {
    /** The kanji surface this alignment is for, e.g. 明日. */
    kanjiText: text("kanji_text").notNull(),
    /** The reading this alignment is for, e.g. あした. */
    readingKana: text("reading_kana").notNull(),
    /** Pre-aligned segments, rendered straight into <ruby> with no runtime work. */
    ruby: jsonb("ruby").$type<RubySegment[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.kanjiText, t.readingKana] })],
);

/* ------------------------------------------------------------------ *
 * Search — denormalized, rebuilt from the tables above after import.
 * ------------------------------------------------------------------ */

/**
 * One row per searchable surface form. Japanese lookup is prefix/exact match,
 * not full-text: Postgres has no Japanese tokenizer and Neon offers neither
 * pgroonga nor pg_bigm. A `text_pattern_ops` btree serves `term LIKE 'ねこ%'`
 * exactly, which is how dictionary lookup actually works.
 */
/*
 * Deliberately has no primary key: rows are only ever bulk-loaded and truncated
 * by the importer, nothing references them, and every lookup goes through the
 * three indexes below. A surrogate id cost 22 MB doing nothing.
 */
export const searchTerms = pgTable(
  "search_terms",
  {
    entryId: bigint("entry_id", { mode: "number" })
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    /** "kanji" | "kana" | "romaji" */
    termType: text("term_type").notNull(),
    /** Ranking weight; lower sorts first. Common kanji 0 … romaji 3. */
    weight: smallint("weight").notNull().default(2),
  },
  (t) => [
    // Prefix search. `text_pattern_ops` is what makes LIKE 'x%' index-eligible
    // regardless of the database's collation.
    index("search_terms_prefix_idx").using(
      "btree",
      sql`${t.term} text_pattern_ops`,
    ),
    // Typo-tolerant fallback when a prefix search returns nothing.
    index("search_terms_trgm_idx").using("gin", sql`${t.term} gin_trgm_ops`),
    index("search_terms_entry_idx").on(t.entryId),
  ],
);

/**
 * One row per entry holding everything a search-result card renders, so listing
 * results is a single indexed lookup with no joins.
 */
export const entrySearch = pgTable(
  "entry_search",
  {
    entryId: bigint("entry_id", { mode: "number" })
      .primaryKey()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** Primary kanji form, or the primary reading when the entry is kana-only. */
    headword: text("headword").notNull(),
    reading: text("reading").notNull(),
    romaji: text("romaji").notNull(),
    /** First few glosses joined, for the result row. */
    glossSummary: text("gloss_summary").notNull(),
    /** Every gloss joined; the source for `glossTsv`. */
    glossBlob: text("gloss_blob").notNull(),
    isCommon: boolean("is_common").notNull().default(false),
    freqRank: integer("freq_rank"),
    /*
     * `simple`, not `english`: it lowercases and splits on word boundaries but
     * does not stem, so a search for "run" finds "to run" without also
     * dragging in "running" and "runner". Looking up a dictionary is a lookup,
     * not a relevance ranking — the word you typed is the word you meant.
     */
    glossTsv: tsvector("gloss_tsv").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('simple', ${entrySearch.glossBlob})`,
    ),
  },
  (t) => [
    index("entry_search_tsv_idx").using("gin", t.glossTsv),
    index("entry_search_rank_idx").on(t.isCommon, t.freqRank),
  ],
);

/* ------------------------------------------------------------------ *
 * User data.
 * ------------------------------------------------------------------ */

export const users = pgTable("users", {
  /** Clerk user id. Rows are lazily upserted on first write — no webhook. */
  id: text("id").primaryKey(),
  /** Which side of the flashcard leads: kanji | furigana | romaji | english. */
  frontMode: text("front_mode").notNull().default("kanji"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userWords = pgTable(
  "user_words",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /*
     * Clerk user id. Deliberately NOT a foreign key to `users`: the first write
     * for a new user would otherwise depend on the `users` row already
     * existing, which is exactly the ordering bug a Clerk webhook introduces.
     */
    userId: text("user_id").notNull(),
    entryId: bigint("entry_id", { mode: "number" })
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** "todo" | "learned" */
    status: text("status").notNull().default("todo"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    learnedAt: timestamp("learned_at", { withTimezone: true }),

    /*
     * The user's own note on this word — a translation into their language, a
     * mnemonic, a usage remark. The only free-form user text the app stores.
     *
     * Nullable rather than `default ''`: "no note" and "empty note" are the
     * same thing to the UI, and NULL keeps the row narrow for the majority who
     * never write one. Deliberately unindexed — it is only ever projected
     * alongside a row already found by `user_id`, never filtered or searched
     * on. Length is capped in the Server Action, not here; see `noteSchema`.
     */
    note: text("note"),

    /*
     * SRS scheduling, unused by the MVP. Present and nullable from day one so
     * SM-2/FSRS can be layered on without a migration.
     */
    dueAt: timestamp("due_at", { withTimezone: true }),
    intervalDays: integer("interval_days"),
    ease: real("ease"),
    repetitions: integer("repetitions"),
    lapses: integer("lapses"),
  },
  (t) => [
    // Makes "add to list" idempotent via onConflictDoNothing.
    uniqueIndex("user_words_user_entry_idx").on(t.userId, t.entryId),
    index("user_words_list_idx").on(t.userId, t.status, t.addedAt.desc()),
  ],
);

export type Entry = typeof entries.$inferSelect;
export type UserWord = typeof userWords.$inferSelect;
export type EntrySearchRow = typeof entrySearch.$inferSelect;
