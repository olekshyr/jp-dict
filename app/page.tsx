import { Suspense } from "react";
import Link from "next/link";

import { AuthControls, AuthControlsFallback } from "./auth-controls";

/**
 * Landing page. The hero reads no request data and prerenders into the static
 * shell; only the auth controls in the header stream, because Clerk's `<Show>`
 * awaits `auth()`.
 *
 * The hero CTA deliberately does not branch on auth state — it always points at
 * /search, and the AuthGate in `(app)/layout.tsx` bounces signed-out visitors to
 * sign-in. That keeps the largest part of the page fully static.
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col px-6">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between py-5">
        <span className="font-semibold tracking-tight">
          jp<span className="text-zinc-400">-</span>dict
        </span>
        <div className="flex items-center gap-2">
          <Suspense fallback={<AuthControlsFallback />}>
            <AuthControls />
          </Suspense>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 py-20">
        <p className="mb-4 font-mono text-sm text-zinc-500">日本語</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Learn Japanese vocabulary,
          <br />
          one word at a time.
        </h1>
        <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Search a dictionary of over 200,000 entries, save the words you want to
          learn, and drill them as flashcards — with kanji, furigana, romaji or
          English on the front.
        </p>

        <div className="mt-10">
          <Link
            href="/search"
            className="inline-block rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Open the dictionary
          </Link>
        </div>
      </div>
    </div>
  );
}
