// @vitest-environment node
import { describe, expect, it } from "vitest";

import { FORECAST_DAYS, toForecastDays, type HourBucket } from "./forecast";

/** An hour bucket `offsetHours` from `from`, as the query would return it. */
function bucket(from: Date, offsetHours: number, count: number): HourBucket {
  const d = new Date(from);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + offsetHours);
  return { hour: d.toISOString(), count };
}

const now = new Date("2026-08-21T12:00:00Z");

describe("toForecastDays", () => {
  it("returns exactly a week", () => {
    expect(toForecastDays([], now)).toHaveLength(FORECAST_DAYS);
  });

  it("fills days with no work with zero", () => {
    const days = toForecastDays([bucket(now, 0, 4)], now);

    expect(days[0].count).toBe(4);
    expect(days.slice(1).every((d) => d.count === 0)).toBe(true);
  });

  it("sums every bucket that falls on the same day", () => {
    const days = toForecastDays(
      [bucket(now, 0, 3), bucket(now, 1, 2), bucket(now, 5, 1)],
      now,
    );

    expect(days[0].count).toBe(6);
  });

  it("puts a bucket a day out on the following day", () => {
    const days = toForecastDays([bucket(now, 24, 7)], now);

    expect(days[0].count).toBe(0);
    expect(days[1].count).toBe(7);
  });

  it("drops buckets past the end of the week", () => {
    const days = toForecastDays([bucket(now, 24 * 9, 5)], now);

    expect(days.every((d) => d.count === 0)).toBe(true);
  });

  it("assigns a bucket by the local day, not the UTC day", () => {
    const late = new Date("2026-08-21T23:00:00Z");
    const buckets = [bucket(late, 0, 2)];

    const tokyo = toForecastDays(buckets, late, 9 * 60);
    const losAngeles = toForecastDays(buckets, late, -7 * 60);

    expect(tokyo[0].count).toBe(2);
    expect(losAngeles[0].count).toBe(2);
    expect(tokyo[0].date.getTime()).not.toBe(losAngeles[0].date.getTime());
  });

  it("labels the first two days by name and the rest by weekday", () => {
    // 2026-08-21 is a Friday, so day 2 is Sunday.
    const days = toForecastDays([], now, 0);

    expect(days[0].label).toBe("Today");
    expect(days[1].label).toBe("Tomorrow");
    expect(days[2].label).toBe("Sun");
    expect(days[6].label).toBe("Thu");
  });

  it("keeps weekday names in English whatever the OS language is", () => {
    const labels = toForecastDays([], now).slice(2).map((d) => d.label);

    expect(labels).toHaveLength(5);
    expect(labels.every((l) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(l))).toBe(
      true,
    );
  });

  it("counts an overdue pile folded into the current hour as today", () => {
    const days = toForecastDays([bucket(now, 0, 137)], now);

    expect(days[0].count).toBe(137);
  });
});
