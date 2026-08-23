/*
 * The two values `user_words.status` can hold. Keys are the vocabulary the app
 * speaks; values are what the column has stored since before FSRS, and stay
 * that way because renaming them is a migration nothing user-facing needs.
 */
export const STATUS = {
  active: "todo",
  paused: "learned",
} as const;

export type WordStatus = (typeof STATUS)[keyof typeof STATUS];
