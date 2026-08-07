"use client";

import { cn } from "@/lib/utils";
import { useNavPending } from "./nav-pending";

/**
 * Marks the content a navigation is about to replace as stale.
 *
 * `children` is the server-rendered subtree, passed straight through as a prop
 * — this component only ever touches the wrapper's className, so what it wraps
 * stays server components.
 *
 * Dimming rather than swapping in a skeleton: the current rows remain readable
 * while the next ones load, but read as clearly out of date. Clicks are blocked
 * so a row that is about to be replaced can't be saved by mistake.
 *
 * Wrap the boundary, not the async component inside it. On a repeat query the
 * boundary never falls back — it is already mounted, so React holds the old
 * rows on screen — and this is what marks them as stale meanwhile.
 */
export function PendingContent({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { pending } = useNavPending();

  return (
    <div
      aria-busy={pending}
      className={cn(
        "transition-opacity duration-200",
        // Delayed on the way in only, so a cached navigation never flickers.
        pending ? "pointer-events-none opacity-50 delay-150" : "opacity-100",
      )}
    >
      {children}
    </div>
  );
}
