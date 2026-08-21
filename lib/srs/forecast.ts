export const FORECAST_DAYS = 7;

/** One hour of the coming week, and how many words fall due in it. */
export type HourBucket = { hour: string; count: number };

/** One day of the forecast. `date` is that day's local midnight. */
export type ForecastDay = { date: Date; label: string; count: number };

const MS_PER_DAY = 86_400_000;

/**
 * Sums hourly buckets into the viewer's next seven calendar days.
 *
 * `offsetMinutes` is minutes *ahead* of UTC — the opposite sign to
 * `getTimezoneOffset`, hence the negation in the default.
 */
export function toForecastDays(
  buckets: readonly HourBucket[],
  now: Date,
  offsetMinutes: number = -now.getTimezoneOffset(),
): ForecastDay[] {
  const offsetMs = offsetMinutes * 60_000;
  const dayOf = (ms: number) => Math.floor((ms + offsetMs) / MS_PER_DAY);
  const today = dayOf(now.getTime());

  const counts = new Map<number, number>();
  for (const bucket of buckets) {
    const day = dayOf(Date.parse(bucket.hour)) - today;
    if (day >= 0 && day < FORECAST_DAYS) {
      counts.set(day, (counts.get(day) ?? 0) + bucket.count);
    }
  }

  return Array.from({ length: FORECAST_DAYS }, (_, index) => ({
    date: new Date((today + index) * MS_PER_DAY - offsetMs),
    label: labelFor(index, today + index),
    count: counts.get(index) ?? 0,
  }));
}

function labelFor(index: number, day: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";

  // "en-US" and not the OS locale, which would translate these while the
  // "Today" and "Tomorrow" above stayed English. `day * MS_PER_DAY` is local
  // midnight expressed as a UTC instant, so the UTC weekday is the local one.
  return new Date(day * MS_PER_DAY).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}
