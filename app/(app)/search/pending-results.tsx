"use client";

import { cn } from "@/lib/utils";
import { useSearchPending } from "../search-pending";

/**
 * Dims the current results while the next query is in flight.
 *
 * `children` is the server-rendered results boundary, passed straight through
 * as a prop — this component only ever touches the wrapper's className, so the
 * results themselves stay server components.
 *
 * Dimming rather than replacing with a skeleton: the previous matches remain
 * readable while the new ones load, but read as clearly out of date. Clicks are
 * blocked so a row that is about to be replaced can't be saved by mistake.
 */
export function PendingResults({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { pending } = useSearchPending();

  return (
    <div
      aria-busy={pending}
      className={cn(
        "transition-opacity duration-200",
        // Delayed on the way in only, so a cached query never flickers.
        pending
          ? "pointer-events-none opacity-50 delay-150"
          : "opacity-100",
      )}
    >
      {children}
    </div>
  );
}
