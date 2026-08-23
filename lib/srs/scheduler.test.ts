// @vitest-environment node
import { describe, expect, it } from "vitest";

import { GRADES, MATURE_DAYS, type Grade } from "./grades";
import {
  bucketOf,
  fromFsrsCard,
  preview,
  schedule,
  toFsrsCard,
  type SchedulingState,
} from "./scheduler";

const NOW = new Date("2026-08-20T00:00:00.000Z");

const unseen = (): SchedulingState => ({
  dueAt: NOW,
  intervalDays: null,
  repetitions: null,
  lapses: null,
  stability: null,
  difficulty: null,
  state: 0,
  learningSteps: 0,
  lastReviewAt: null,
});

/** Grades a word repeatedly, each time on the day it comes due. */
function drill(grades: Grade[]): { row: SchedulingState; at: Date } {
  let row = unseen();
  let at = NOW;
  for (const grade of grades) {
    row = schedule(row, grade, at).next;
    at = row.dueAt ?? at;
  }
  return { row, at };
}

describe("schedule", () => {
  it("moves an unseen word into review and counts the rep", () => {
    const { next } = schedule(unseen(), "good", NOW);

    expect(next.state).toBe(2);
    expect(next.repetitions).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.lastReviewAt).toEqual(NOW);
    expect((next.dueAt as Date).getTime()).toBeGreaterThan(NOW.getTime());
  });

  // GRADES runs easiest to hardest, so the intervals it produces must descend.
  it("gives a harder grade a shorter interval than an easier one", () => {
    const intervals = GRADES.map((g) => schedule(unseen(), g, NOW).next.intervalDays as number);

    expect(intervals).toStrictEqual([...intervals].sort((a, b) => b - a));
    expect(new Set(intervals).size).toBe(GRADES.length);
  });

  /*
   * The guard on `enable_short_term: false`. Turning it on makes FSRS answer a
   * failed card in minutes, which rounds to a 0-day interval and a due date in
   * the past — the card would then be permanently due.
   */
  it("only ever schedules whole days, at least one", () => {
    const cases = [unseen(), drill(["good"]).row, drill(["good", "good"]).row];

    for (const row of cases) {
      for (const grade of GRADES) {
        const { intervalDays } = schedule(row, grade, row.dueAt as Date).next;
        expect(Number.isInteger(intervalDays)).toBe(true);
        expect(intervalDays).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("counts a lapse and pulls the word back in when it is forgotten", () => {
    const { row, at } = drill(["good", "good"]);
    const { next } = schedule(row, "again", at);

    expect(next.lapses).toBe(1);
    expect(next.intervalDays).toBeLessThan(row.intervalDays as number);
    expect(next.repetitions).toBe(3);
  });

  it("does not count a lapse when the word is recalled", () => {
    const { next } = schedule(drill(["good"]).row, "hard", NOW);

    expect(next.lapses).toBe(0);
  });

  it("logs the state the card was in before the review, not after", () => {
    const { row, at } = drill(["good"]);
    const { log, next } = schedule(row, "easy", at);

    expect(log.rating).toBe(4);
    expect(log.state).toBe(row.state);
    // ts-fsrs puts `last_review || due` in this field, not the due date.
    expect(log.prevReviewAt).toEqual(row.lastReviewAt);
    expect(log.stability).toBe(row.stability);
    expect(log.scheduledDays).toBe(row.intervalDays);
    expect(log.reviewedAt).toEqual(at);
    expect(log.stability).not.toBe(next.stability);
  });

  it("hands back previews for where the card landed", () => {
    const { previews } = schedule(unseen(), "good", NOW);

    expect(Object.keys(previews).sort()).toStrictEqual([...GRADES].sort());
  });
});

describe("preview", () => {
  it("labels a fresh word in days", () => {
    expect(preview(unseen(), NOW)).toStrictEqual({
      again: "1d",
      hard: "2d",
      good: "3d",
      easy: "4d",
    });
  });

  it("switches to months and years as the interval grows", () => {
    const { row, at } = drill(["easy", "easy", "easy"]);
    const labels = Object.values(preview(row, at));

    expect(labels.some((l) => l.endsWith("mo") || l.endsWith("y"))).toBe(true);
    for (const label of labels) expect(label).toMatch(/^\d+(\.\d)?(d|mo|y)$/);
  });

  it("never labels an interval as zero", () => {
    const { row, at } = drill(["good", "good", "good"]);

    for (const label of Object.values(preview(row, at))) {
      expect(label).not.toMatch(/^0/);
    }
  });
});

describe("toFsrsCard / fromFsrsCard", () => {
  it("round-trips a scheduled word", () => {
    const { row } = drill(["good", "hard"]);

    expect(fromFsrsCard(toFsrsCard(row, NOW))).toStrictEqual(row);
  });

  it("stands a never-reviewed word up with no nulls", () => {
    const card = toFsrsCard(unseen(), NOW);

    expect(card.last_review).toBeUndefined();
    expect(card.stability).toBe(0);
    expect(card.reps).toBe(0);
    expect(card.due).toEqual(NOW);
  });

  it("falls back to now when the row somehow has no due date", () => {
    expect(toFsrsCard({ ...unseen(), dueAt: null }, NOW).due).toEqual(NOW);
  });

  it("maps a card that has never been reviewed back to a null timestamp", () => {
    const card = toFsrsCard(unseen(), NOW);

    expect(fromFsrsCard(card).lastReviewAt).toBeNull();
  });
});

describe("bucketOf", () => {
  it("calls an unreviewed word new, whatever its interval says", () => {
    expect(bucketOf({ state: 0, intervalDays: null })).toBe("new");
    expect(bucketOf({ state: 0, intervalDays: 999 })).toBe("new");
  });

  it("splits review words on the maturity threshold", () => {
    expect(bucketOf({ state: 2, intervalDays: MATURE_DAYS - 1 })).toBe("learning");
    expect(bucketOf({ state: 2, intervalDays: MATURE_DAYS })).toBe("mature");
  });

  it("treats the transitional states as learning", () => {
    expect(bucketOf({ state: 1, intervalDays: 100 })).toBe("learning");
    expect(bucketOf({ state: 3, intervalDays: 100 })).toBe("learning");
  });

  // A review row with no interval should not be able to reach "mature" through
  // a null, which is what the SQL CASE guards with its own coalesce.
  it("treats a review word with no interval as learning", () => {
    expect(bucketOf({ state: 2, intervalDays: null })).toBe("learning");
  });
});
