import { Suspense } from "react";
import Link from "next/link";
import { SparklesIcon } from "lucide-react";

import { formatDueIn } from "@/lib/srs/grades";
import {
  getDueForecast,
  getFrontMode,
  getNextDueAt,
  getReviewCards,
} from "@/lib/user-words/queries";
import { DueForecast } from "./due-forecast";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Flashcards } from "./flashcards";

function ReviewSkeleton() {
  return <Skeleton className="h-72 rounded-xl" />;
}

async function Session() {
  /*
   * All three are per-user and uncached, so they run together. The due-date
   * lookup only matters when the session comes back empty, but it is a single
   * indexed row on the index the session query already uses — cheaper here
   * than a second round-trip on the branch that needs it.
   */
  const [cards, frontMode, nextDue] = await Promise.all([
    getReviewCards(),
    getFrontMode(),
    getNextDueAt(),
  ]);

  if (cards.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>
            {nextDue ? "All caught up" : "Nothing to review yet"}
          </EmptyTitle>
          <EmptyDescription>
            {nextDue
              ? `The next word is due ${formatDueIn(nextDue, new Date())}.`
              : "Save a word and it shows up here straight away."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={nextDue ? "/list" : "/search"} />}
          >
            {nextDue ? "Back to my list" : "Find words"}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return <Flashcards cards={cards} initialMode={frontMode} />;
}

async function Forecast() {
  return <DueForecast buckets={await getDueForecast()} />;
}

export default function ReviewPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Review</h1>
      <Suspense fallback={<ReviewSkeleton />}>
        <Session />
      </Suspense>
      {/* Its own boundary: the cards must not wait on a second round-trip. */}
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-52 rounded-xl" />}>
          <Forecast />
        </Suspense>
      </div>
    </div>
  );
}
