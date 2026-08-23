import { isJapanese, isKana, toHiragana, toRomaji } from "wanakana";

/**
 * How a search box entry should be routed.
 *
 * Japanese input is looked up by prefix against kanji/kana surface forms;
 * Latin input could be either romaji or an English gloss, so it tries both.
 */
export const SCRIPT = {
  japanese: "japanese",
  latin: "latin",
  empty: "empty",
} as const;

export type QueryScript = (typeof SCRIPT)[keyof typeof SCRIPT];

/**
 * The longest query the dictionary will look at.
 *
 * The raw query is both a bind parameter and — via `searchEntries` — part of a
 * `use cache` key that never expires, so its length needs a bound of its own
 * rather than inheriting whatever fits in a URL. 64 code points is well past
 * the longest headword or gloss phrase in JMdict.
 */
export const MAX_QUERY_LENGTH = 64;

/**
 * Trims a raw query and caps its length, so what reaches the query layer is
 * bounded and canonical: `" neko "` and `"neko"` are one cache entry, not two.
 *
 * Truncates rather than rejects. Every search here is a prefix or a trigram
 * match, and a shorter prefix only ever matches more, so a clipped query still
 * answers the question the user was asking. Slicing by code point rather than
 * by UTF-16 unit keeps the cut from splitting a surrogate pair and handing
 * Postgres half a character.
 */
export function clampQuery(raw: string): string {
  return [...raw.trim()].slice(0, MAX_QUERY_LENGTH).join("");
}

export function detectScript(raw: string): QueryScript {
  const q = raw.trim();
  if (q.length === 0) return SCRIPT.empty;
  // isJapanese covers kana, kanji and Japanese punctuation.
  if ([...q].some((char) => isJapanese(char) && !/\s/.test(char))) {
    return SCRIPT.japanese;
  }
  return SCRIPT.latin;
}

/**
 * Escapes the LIKE metacharacters so a user typing `100%` or `a_b` searches for
 * those literal characters rather than wildcards.
 *
 * Pair with `ESCAPE '\'` in the query.
 */
export function escapeLikePrefix(raw: string): string {
  return `${raw.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Normalizes Japanese input for lookup.
 *
 * Katakana and hiragana readings are distinct in JMdict, but a learner typing
 * ネコ expects to find ねこ, so kana is folded to hiragana. Kanji passes through.
 */
export function normalizeJapanese(raw: string): string {
  const q = raw.trim();
  return isKana(q) ? toHiragana(q) : q;
}

/** Normalizes Latin input to the same Hepburn form stored in `readings.romaji`. */
export function normalizeRomaji(raw: string): string {
  // toRomaji is a no-op on Latin text but normalizes long-vowel and case forms.
  return toRomaji(raw.trim().toLowerCase());
}
