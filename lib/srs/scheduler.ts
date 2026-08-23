import {
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
} from "ts-fsrs";

import {
  BUCKET,
  formatInterval,
  MATURE_DAYS,
  type Bucket,
  type Grade,
  type Previews,
} from "./grades";

const RATING: Record<Grade, Rating.Again | Rating.Hard | Rating.Good | Rating.Easy> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/*
 * `enable_short_term: false` is load-bearing, not a preference. With it on,
 * FSRS answers a failed card with a sub-day interval, and `interval_days` is an
 * integer column — there is nowhere to put "10 minutes". The same-session retry
 * lives in the client deck instead (app/(app)/review/flashcards.tsx), so every
 * interval that reaches the database is a whole number of days.
 */
const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

/** The scheduling columns of a `user_words` row, and nothing else. */
export type SchedulingState = {
  dueAt: Date | null;
  intervalDays: number | null;
  repetitions: number | null;
  lapses: number | null;
  stability: number | null;
  difficulty: number | null;
  state: number;
  learningSteps: number;
  lastReviewAt: Date | null;
};

/** What one grade did to a card, ready to append to `review_log`. */
export type GradeLog = {
  rating: number;
  state: number;
  prevReviewAt: Date | null;
  stability: number | null;
  difficulty: number | null;
  scheduledDays: number | null;
  learningSteps: number | null;
  reviewedAt: Date;
};

export function toFsrsCard(row: SchedulingState, now: Date): FsrsCard {
  return {
    due: row.dueAt ?? now,
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    // Deprecated in FSRS and recomputed from `last_review` on every review, so
    // whatever is passed here is discarded.
    elapsed_days: 0,
    scheduled_days: row.intervalDays ?? 0,
    learning_steps: row.learningSteps,
    reps: row.repetitions ?? 0,
    lapses: row.lapses ?? 0,
    state: row.state as State,
    last_review: row.lastReviewAt ?? undefined,
  };
}

export function fromFsrsCard(card: FsrsCard): SchedulingState {
  return {
    dueAt: card.due,
    intervalDays: card.scheduled_days,
    repetitions: card.reps,
    lapses: card.lapses,
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    learningSteps: card.learning_steps,
    lastReviewAt: card.last_review ?? null,
  };
}

export function schedule(
  row: SchedulingState,
  grade: Grade,
  now: Date,
): { next: SchedulingState; log: GradeLog; previews: Previews } {
  const { card, log } = scheduler.next(toFsrsCard(row, now), now, RATING[grade]);
  const next = fromFsrsCard(card);

  return {
    next,
    log: {
      rating: log.rating,
      state: log.state,
      prevReviewAt: log.due,
      stability: log.stability,
      difficulty: log.difficulty,
      scheduledDays: log.scheduled_days,
      learningSteps: log.learning_steps,
      reviewedAt: log.review,
    },
    previews: preview(next, now),
  };
}

/**
 * What each button would schedule, as text the card can render.
 *
 * Formatted here rather than on the client so `ts-fsrs` never reaches the
 * browser bundle and the server stays the only thing that knows how to
 * schedule — the same reason `Card` carries glosses rather than sense rows.
 */
export function preview(row: SchedulingState, now: Date): Previews {
  const p = scheduler.repeat(toFsrsCard(row, now), now);
  return {
    again: formatInterval(p[Rating.Again].card.due, now),
    hard: formatInterval(p[Rating.Hard].card.due, now),
    good: formatInterval(p[Rating.Good].card.due, now),
    easy: formatInterval(p[Rating.Easy].card.due, now),
  };
}

export function bucketOf(row: Pick<SchedulingState, "state" | "intervalDays">): Bucket {
  if (row.state === State.New) return BUCKET.new;
  if (row.state === State.Review && (row.intervalDays ?? 0) >= MATURE_DAYS) {
    return BUCKET.mature;
  }
  return BUCKET.learning;
}
