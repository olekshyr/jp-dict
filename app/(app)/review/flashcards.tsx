"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { gradeCard, setFrontMode } from "@/app/actions/words";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CheckCheckIcon } from "lucide-react";
import { GRADES, GRADE_LABELS, type Grade } from "@/lib/srs/grades";
import type { Card, FrontMode } from "@/lib/user-words/queries";
import type { RubySegment } from "@/lib/db/schema";
import { FrontModeTabs } from "./front-mode-tabs";

function Ruby({ segments, fallback }: Readonly<{ segments: RubySegment[] | null; fallback: string }>) {
  if (!segments || segments.length === 0) return <>{fallback}</>;
  return (
    <ruby>
      {segments.map((segment, i) => (
        <ruby key={i}>
          {segment.ruby}
          <rt className="text-[0.35em] text-muted-foreground">
            {segment.rt ?? ""}
          </rt>
        </ruby>
      ))}
    </ruby>
  );
}

/** What shows on the front of the card, given the chosen mode. */
function Front({ card, mode }: Readonly<{ card: Card; mode: FrontMode }>) {
  switch (mode) {
    case "furigana":
      return (
        <span className="text-5xl leading-relaxed">
          <Ruby segments={card.ruby} fallback={card.headword} />
        </span>
      );
    case "romaji":
      return <span className="font-mono text-4xl">{card.romaji}</span>;
    case "english":
      return <span className="text-2xl">{card.glosses}</span>;
    case "kanji":
    default:
      return <span className="text-6xl">{card.headword}</span>;
  }
}

/** The reverse of whatever the front showed. */
function Back({ card, mode }: Readonly<{ card: Card; mode: FrontMode }>) {
  if (mode === "english") {
    return (
      <div className="space-y-2 text-center">
        <div className="text-5xl">{card.headword}</div>
        <div className="text-lg text-muted-foreground">{card.reading}</div>
        <div className="font-mono text-sm text-muted-foreground">
          {card.romaji}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-center">
      <div className="text-xl">{card.glosses}</div>
      <div className="text-muted-foreground">{card.reading}</div>
      <div className="font-mono text-sm text-muted-foreground">
        {card.romaji}
      </div>
    </div>
  );
}

export function Flashcards({
  cards,
  initialMode,
}: Readonly<{
  cards: Card[];
  initialMode: FrontMode;
}>) {
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [, startTransition] = useTransition();

  const [deck, setDeck] = useState(cards);

  const card = deck[0];

  /*
   * Every grade is an answer, so every grade moves the due date and drops the
   * card — which is what keeps `deck.length` equal to what a refresh would
   * hand back. Seeing a word again this session is "later", not "again".
   */
  function handleGrade(grade: Grade) {
    const graded = card;

    setFlipped(false);
    setDeck((d) => d.filter((c) => c.entryId !== graded.entryId));

    startTransition(async () => {
      try {
        await gradeCard(graded.entryId, grade);
      } catch (error) {
        console.error(error);
        // Back to the head, so the word the user believes they answered is the
        // one the toast is about.
        setDeck((d) => [graded, ...d]);
        toast.add({
          type: "error",
          title: "Couldn't save",
          description: "Check your connection and try again.",
        });
      }
    });
  }

  function handleSkip() {
    setFlipped(false);
    setDeck((d) => [...d.slice(1), d[0]]);
  }

  if (!card) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Session complete</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/list" />}
          >
            Back to my list
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div>
      <FrontModeTabs
        mode={mode}
        onModeChange={(next) => {
          const previous = mode;
          setMode(next);
          setFlipped(false);
          startTransition(async () => {
            try {
              await setFrontMode(next);
            } catch (error) {
              console.error(error);
              setMode(previous);
              toast.add({
                type: "error",
                title: "Couldn't save your preference",
                description: "Check your connection and try again.",
              });
            }
          });
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.entryId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Flip back to the front" : "Flip to the answer"}
            className="flex min-h-64 w-full items-center justify-center rounded-xl border p-8 transition-colors hover:border-ring"
          >
            {flipped ? (
              <Back card={card} mode={mode} />
            ) : (
              <Front card={card} mode={mode} />
            )}
          </button>
        </motion.div>
      </AnimatePresence>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        {deck.length} left
      </p>
      <div className="mt-6">
        {flipped ? (
          <div className="grid grid-cols-5 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-14 flex-col gap-0.5"
              disabled={deck.length < 2}
              onClick={handleSkip}
            >
              Later
            </Button>
            {GRADES.map((grade) => (
              <Button
                key={grade}
                type="button"
                variant="outline"
                onClick={() => handleGrade(grade)}
                className="h-14 flex-col gap-0.5"
              >
                <span>{GRADE_LABELS[grade]}</span>
                <span className="text-xs font-normal opacity-70">
                  {card.previews[grade]}
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-14 w-full"
            onClick={() => setFlipped(true)}
          >
            Reveal answer
          </Button>
        )}
      </div>
    </div>
  );
}
