import { Suspense } from "react";
import Link from "next/link";
import { SparklesIcon } from "lucide-react";

import { getFrontMode, getReviewCards } from "@/lib/user-words/queries";
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
  // Both are per-user and uncached; run them together rather than in series.
  const [cards, frontMode] = await Promise.all([
    getReviewCards(20),
    getFrontMode(),
  ]);

  if (cards.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing left to review</EmptyTitle>
          <EmptyDescription>
            Every saved word is marked learned.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/search" />}
          >
            Find more words
          </Button>
        </EmptyContent>
      </Empty>
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
