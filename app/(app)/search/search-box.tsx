"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";

/** Search is the primary action on this page, so the field runs larger than the default. */
const inputClass = "h-11 rounded-lg px-4 text-base md:text-base";

/**
 * Static stand-in rendered while the seeded box streams in. Keeping the markup
 * identical means the search field is present in the prerendered HTML and does
 * not visibly shift when the real box takes over.
 */
export function SearchBoxFallback() {
  return (
    <div className="mb-8">
      <Input
        className={inputClass}
        placeholder="Search 猫, ねこ, neko or cat…"
        aria-label="Search the dictionary"
        disabled
      />
    </div>
  );
}

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  return (
    <form
      className="mb-8"
      onSubmit={(event) => {
        event.preventDefault();
        const next = String(new FormData(event.currentTarget).get("q") ?? "").trim();
        router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
      }}
    >
      <Input
        // Remounting on a new URL query keeps the box in step with back/forward
        // navigation without an effect that would re-render on every keystroke.
        key={urlQuery}
        className={inputClass}
        name="q"
        defaultValue={urlQuery}
        placeholder="Search 猫, ねこ, neko or cat…"
        aria-label="Search the dictionary"
        autoComplete="off"
        autoFocus
      />
    </form>
  );
}
