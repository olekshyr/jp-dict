/*
 * The scheduling vocabulary, kept free of any `ts-fsrs` import so the review
 * screen can label its buttons without pulling the scheduler into the browser
 * bundle. Everything that actually schedules lives in ./scheduler.
 */

export const GRADES = ["again", "hard", "good", "easy"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

export const BUCKETS = ["new", "learning", "mature"] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Anki's threshold for a card that has left the fragile early intervals. */
export const MATURE_DAYS = 21;

/**
 * What `/list` filters by: the three schedule-derived buckets, plus retired.
 *
 * Lives here rather than beside the queries because the tab strip and every
 * row are client components, and `lib/user-words/queries.ts` is `server-only`.
 */
export type ListFilter = Bucket | "retired";
export const LIST_FILTERS = [...BUCKETS, "retired"] as const;
export type Counts = Record<ListFilter, number>;

export const FILTER_LABELS: Record<ListFilter, string> = {
  new: "New",
  learning: "Learning",
  mature: "Mature",
  retired: "Retired",
};

export function isListFilter(value: string): value is ListFilter {
  return (LIST_FILTERS as readonly string[]).includes(value);
}

/** What each grade would schedule, already formatted for display. */
export type Previews = Record<Grade, string>;

export function isGrade(value: string): value is Grade {
  return (GRADES as readonly string[]).includes(value);
}

export function isBucket(value: string): value is Bucket {
  return (BUCKETS as readonly string[]).includes(value);
}

const MS_PER_DAY = 86_400_000;

/** How long until `due`, as a button label: "3d", "1.5mo", "2y". */
export function formatInterval(due: Date, now: Date): string {
  return unit(Math.max(1, Math.round((due.getTime() - now.getTime()) / MS_PER_DAY)));
}

/**
 * The same span as a sentence fragment: "in 3 hours", "tomorrow", "in 2mo".
 *
 * Hours below a day rather than rounding them up to "tomorrow": intervals are
 * whole days from the moment of grading, so a card graded at 09:00 is six hours
 * away at 03:00 the next morning, and calling that "tomorrow" is just wrong.
 */
export function formatDueIn(due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return "now";

  const hours = ms / 3_600_000;
  if (hours < 24) {
    const rounded = Math.max(1, Math.round(hours));
    return `in ${rounded} hour${rounded === 1 ? "" : "s"}`;
  }

  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 30) return `in ${days} days`;
  return `in ${unit(days)}`;
}

function unit(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${round1(days / 30)}mo`;
  return `${round1(days / 365)}y`;
}

function round1(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}
