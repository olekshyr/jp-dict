"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-base outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500";

/**
 * Static stand-in rendered while the seeded box streams in. Keeping the markup
 * identical means the search field is present in the prerendered HTML and does
 * not visibly shift when the real box takes over.
 */
export function SearchBoxFallback() {
  return (
    <div className="mb-8">
      <input
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
  const [value, setValue] = useState(urlQuery);

  // Keep the box in step with back/forward navigation.
  useEffect(() => {
    setValue(urlQuery);
  }, [urlQuery]);

  return (
    <form
      className="mb-8"
      onSubmit={(event) => {
        event.preventDefault();
        const next = value.trim();
        router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
      }}
    >
      <input
        className={inputClass}
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search 猫, ねこ, neko or cat…"
        aria-label="Search the dictionary"
        autoComplete="off"
        autoFocus
      />
    </form>
  );
}
