"use client";

import { useMemo, useSyncExternalStore } from "react";

import { toForecastDays, type HourBucket } from "@/lib/srs/forecast";
import { Skeleton } from "@/components/ui/skeleton";

const subscribe = () => () => {};

export function DueForecast({ buckets }: Readonly<{ buckets: HourBucket[] }>) {
  // Which local day an hour falls in depends on the viewer's clock, so the
  // server cannot render days without risking a hydration mismatch.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const days = useMemo(
    () => (mounted ? toForecastDays(buckets, new Date()) : null),
    [mounted, buckets],
  );

  if (!days) return <Skeleton className="h-52 rounded-xl" />;

  const total = days.reduce((sum, day) => sum + day.count, 0);
  const busiest = Math.max(...days.map((day) => day.count));

  return (
    <section className="rounded-xl border p-4">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium">Coming up</h2>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "Nothing due this week"
            : `${total} ${total === 1 ? "word" : "words"} this week`}
        </p>
      </div>

      <table className="w-full">
        <caption className="sr-only">
          Words coming due over the next seven days
        </caption>
        <tbody>
          {days.map((day) => (
            <tr key={day.date.toISOString()}>
              <th
                scope="row"
                className="w-20 py-1 pr-3 text-left text-sm font-normal text-muted-foreground"
              >
                {day.label}
              </th>
              {/* The row already states the day and the count in text. */}
              <td className="w-full py-1" aria-hidden="true">
                <div className="h-2.5 w-full rounded-full bg-muted/50">
                  {day.count > 0 && (
                    <div
                      className="h-2.5 min-w-[6px] rounded-r-[4px] bg-primary"
                      style={{ width: `${(day.count / busiest) * 100}%` }}
                    />
                  )}
                </div>
              </td>
              <td className="w-10 py-1 pl-3 text-right text-sm tabular-nums text-muted-foreground">
                {day.count === 0 ? "—" : day.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
