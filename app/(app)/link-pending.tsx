"use client";

import { useEffect, useId } from "react";
import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { useNavPending } from "./nav-pending";

/**
 * The pending affordance for a <Link>, rendered *inside* the link it reports on.
 *
 * `useLinkStatus` only works from a descendant of <Link>, which is also the
 * only reason this is a component rather than a hook call in the parent. Base
 * UI's `render={<Link/>}` clones the anchor and nests the trigger's children
 * inside it, so placing this among those children puts it in the right subtree.
 *
 * Reporting happens in an effect on purpose. Updates scheduled from an effect
 * are not part of the router's transition, so they land on the tree that is
 * currently on screen instead of being withheld until the navigation commits —
 * which is the whole point, since the withheld commit is what we are covering.
 *
 * `useLinkStatus` rather than an onClick handler: onClick also fires for
 * ⌘-click and middle-click, which open a new tab and never navigate, and would
 * leave the page marked pending forever. It also reports nothing at all when
 * the shell was already prefetched, so a fast transition shows no flicker.
 *
 * `spinner={false}` keeps the reporting and drops the visual, for controls with
 * nowhere sensible to put it — the filter tabs already carry a count badge, and
 * a second adornment in that corner reads as clutter rather than progress.
 * Those still dim their rows, which is the feedback that matters.
 */
export function LinkPending({
  spinner = true,
  className,
}: Readonly<{ spinner?: boolean; className?: string }>) {
  const { pending } = useLinkStatus();
  const { reportLinkPending } = useNavPending();
  const id = useId();

  useEffect(() => {
    reportLinkPending(id, pending);
    // The link that started a navigation is usually replaced by the tree that
    // navigation produced, so clearing on unmount is not optional — a stuck id
    // would leave the whole app dimmed.
    return () => reportLinkPending(id, false);
  }, [id, pending, reportLinkPending]);

  if (!spinner) return null;

  return (
    /*
     * Always rendered, only faded, and positioned out of flow, so it costs no
     * layout however cramped the control is — a page number is a 36px square.
     * Sits just outside the top-right corner to clear the filter tabs' count
     * badge. The parent needs `relative`.
     *
     * The delay is on the way in only: a prefetched navigation commits well
     * inside 150ms and shows nothing, while a slow one fades up and then clears
     * instantly. Same idiom as the search field's spinner.
     *
     * <Spinner> spins unconditionally, so idle passes `animate-none` for
     * tailwind-merge to drop it: no animation ticking behind opacity-0. It also
     * carries its own `role="status"`, which `aria-hidden` takes back — a
     * pagination strip would otherwise announce "Loading" once per link.
     */
    <Spinner
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-1 -right-1 size-3 text-muted-foreground transition-opacity duration-200",
        pending ? "opacity-100 delay-150" : "animate-none opacity-0",
        className,
      )}
    />
  );
}
