// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatDueIn,
  formatInterval,
  GRADES,
  GRADE_LABELS,
  isBucket,
  isGrade,
  isListFilter,
  LIST_FILTERS,
} from "./grades";

const NOW = new Date("2026-08-20T00:00:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("guards", () => {
  it("accepts only the four grades", () => {
    expect(GRADES.every(isGrade)).toBe(true);
    expect(isGrade("Good")).toBe(false);
    expect(isGrade("skip")).toBe(false);
  });

  it("accepts only the derived buckets", () => {
    expect(isBucket("mature")).toBe(true);
    // "retired" comes from `status`, not from the schedule.
    expect(isBucket("retired")).toBe(false);
    expect(isBucket("all")).toBe(false);
  });

  it("accepts every list filter, retired included", () => {
    expect(LIST_FILTERS.every(isListFilter)).toBe(true);
    // "all" is a URL value the list page understands, not a bucket a row is in.
    expect(isListFilter("all")).toBe(false);
    expect(isListFilter("todo")).toBe(false);
  });

  // Order is the order the buttons render in: easiest first, "Again" last.
  it("labels every grade", () => {
    expect(GRADES.map((g) => GRADE_LABELS[g])).toStrictEqual([
      "Easy",
      "Good",
      "Hard",
      "Again",
    ]);
  });
});

describe("formatInterval", () => {
  it("counts days, then months, then years", () => {
    expect(formatInterval(inDays(3), NOW)).toBe("3d");
    expect(formatInterval(inDays(29), NOW)).toBe("29d");
    expect(formatInterval(inDays(45), NOW)).toBe("1.5mo");
    expect(formatInterval(inDays(730), NOW)).toBe("2y");
  });

  /*
   * A sub-day interval would render as "0d" and read as "not scheduled". The
   * scheduler runs with short-term steps off precisely so this cannot arise,
   * but the label must not be the thing that makes it visible if it ever does.
   */
  it("never renders a zero interval", () => {
    expect(formatInterval(NOW, NOW)).toBe("1d");
    expect(formatInterval(inDays(-5), NOW)).toBe("1d");
  });
});

describe("formatDueIn", () => {
  it("reads as a sentence fragment", () => {
    expect(formatDueIn(inDays(1), NOW)).toBe("tomorrow");
    expect(formatDueIn(inDays(4), NOW)).toBe("in 4 days");
    expect(formatDueIn(inDays(60), NOW)).toBe("in 2mo");
  });

  it("says now for anything already due", () => {
    expect(formatDueIn(NOW, NOW)).toBe("now");
    expect(formatDueIn(inDays(-3), NOW)).toBe("now");
  });

  it("counts hours below a day rather than calling them tomorrow", () => {
    expect(formatDueIn(new Date(NOW.getTime() + 6 * 3_600_000), NOW)).toBe(
      "in 6 hours",
    );
    expect(formatDueIn(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(
      "in 1 hour",
    );
    expect(formatDueIn(new Date(NOW.getTime() + 60_000), NOW)).toBe("in 1 hour");
  });
});
