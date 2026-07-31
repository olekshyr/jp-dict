"use client";

import { useRouter } from "next/navigation";
import { LoaderCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { paginationHref } from "@/lib/pagination";
import { Input } from "@/components/ui/input";
import { useSearchPending } from "./search-pending";

/**
 * The search box itself, with no knowledge of the current URL. Seeding it from
 * `?q` needs `useSearchParams`, which forces client-side rendering up to the
 * nearest Suspense boundary — only the search page has a query worth restoring,
 * so that read lives in <SearchBox> and every other route renders this directly
 * and keeps its field in the static shell.
 *
 * `perPage` follows the same split: the search page passes the one it is
 * currently showing so a new query keeps it, and every other mount omits it and
 * gets the default.
 */
export function SearchField({
  defaultValue = "",
  perPage,
  autoFocus = false,
  disabled = false,
}: Readonly<{
  defaultValue?: string;
  perPage?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}>) {
  const router = useRouter();
  const { pending, startSearch } = useSearchPending();

  return (
    <form
      className="mb-8"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const next = String(
          new FormData(event.currentTarget).get("q") ?? "",
        ).trim();
        // Inside a transition so the pending navigation is observable: this
        // field shows a spinner, and on the search page the stale results dim.
        //
        // The page size survives a new query; the page number does not — a new
        // result set starts at the top. `paginationHref` drops the default page
        // size, so the common case stays a clean `?q=`.
        startSearch(() => {
          router.push(paginationHref("/search", { q: next, perPage }));
        });
      }}
    >
      <div className="relative">
        <Input
          // Search is the primary action wherever this field appears, so it runs
          // larger than the default. The right padding is permanent so the
          // spinner never displaces the text it appears next to.
          className="h-11 rounded-lg px-4 pr-11 text-base md:text-base"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search 猫, ねこ, neko or cat…"
          aria-label="Search the dictionary"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
        />
        {/*
          Always rendered and only faded, so it costs no layout. The delay is on
          the way in only: a cached query commits well inside 150ms and shows
          nothing at all, while a slow one fades up and then clears instantly.

          The field stays enabled while pending — disabling it would pull focus
          out mid-search.
        */}
        <LoaderCircleIcon
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground transition-opacity duration-200",
            pending ? "animate-spin opacity-100 delay-150" : "opacity-0",
          )}
        />
      </div>
    </form>
  );
}
