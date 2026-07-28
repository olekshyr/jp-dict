import { Suspense } from "react";
import Link from "next/link";

import { getFrontMode, getReviewCards } from "@/lib/user-words/queries";
import { Flashcards } from "./flashcards";

function ReviewSkeleton() {
  return (
    <div className="h-72 animate-pulse rounded-xl bg-muted" />
  );
}

async function Session() {
  // Both are per-user and uncached; run them together rather than in series.
  const [cards, frontMode] = await Promise.all([
    getReviewCards(20),
    getFrontMode(),
  ]);

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border py-16 text-center">
        <p className="text-lg">Nothing left to review.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Every saved word is marked learned.
        </p>
        <Link
          href="/search"
          className="mt-4 inline-block text-sm underline underline-offset-4"
        >
          Find more words
        </Link>
      </div>
    );
  }

  return <Flashcards cards={cards} initialMode={frontMode} />;
}

export default function ReviewPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Review</h1>
      <Suspense fallback={<ReviewSkeleton />}>
        <Session />
      </Suspense>
    </div>
  );
}
