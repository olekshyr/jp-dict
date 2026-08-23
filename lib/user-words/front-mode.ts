/*
 * Which side of a flashcard leads, as stored in `users.front_mode`. Kept apart
 * from ./queries so the review tabs — a client component — can import the
 * values without pulling in `server-only`.
 */
export const FRONT_MODE = {
  kanji: "kanji",
  furigana: "furigana",
  romaji: "romaji",
  english: "english",
} as const;

/** Tab order. */
export const FRONT_MODES = [
  FRONT_MODE.kanji,
  FRONT_MODE.furigana,
  FRONT_MODE.romaji,
  FRONT_MODE.english,
] as const;

export type FrontMode = (typeof FRONT_MODES)[number];

export const FRONT_MODE_LABELS: Record<FrontMode, string> = {
  [FRONT_MODE.kanji]: "Kanji",
  [FRONT_MODE.furigana]: "Furigana",
  [FRONT_MODE.romaji]: "Romaji",
  [FRONT_MODE.english]: "English",
};

export const DEFAULT_FRONT_MODE = FRONT_MODE.kanji;

export function isFrontMode(value: string): value is FrontMode {
  return (FRONT_MODES as readonly string[]).includes(value);
}
