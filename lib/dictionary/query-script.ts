import { isJapanese, isKana, toHiragana, toRomaji } from "wanakana";

/**
 * How a search box entry should be routed.
 *
 * Japanese input is looked up by prefix against kanji/kana surface forms;
 * Latin input could be either romaji or an English gloss, so it tries both.
 */
export type QueryScript = "japanese" | "latin" | "empty";

export function detectScript(raw: string): QueryScript {
  const q = raw.trim();
  if (q.length === 0) return "empty";
  // isJapanese covers kana, kanji and Japanese punctuation.
  if ([...q].some((char) => isJapanese(char) && !/\s/.test(char))) {
    return "japanese";
  }
  return "latin";
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
