"use client";

import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";

/**
 * The search box itself, with no knowledge of the current URL. Seeding it from
 * `?q` needs `useSearchParams`, which forces client-side rendering up to the
 * nearest Suspense boundary — only the search page has a query worth restoring,
 * so that read lives in <SearchBox> and every other route renders this directly
 * and keeps its field in the static shell.
 */
export function SearchField({
  defaultValue = "",
  autoFocus = false,
  disabled = false,
}: Readonly<{
  defaultValue?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}>) {
  const router = useRouter();

  return (
    <form
      className="mb-8"
      onSubmit={(event) => {
        event.preventDefault();
        const next = String(
          new FormData(event.currentTarget).get("q") ?? "",
        ).trim();
        router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
      }}
    >
      <Input
        // Search is the primary action wherever this field appears, so it runs
        // larger than the default.
        className="h-11 rounded-lg px-4 text-base md:text-base"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search 猫, ねこ, neko or cat…"
        aria-label="Search the dictionary"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
      />
    </form>
  );
}
