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

function Ruby({ segments, fallback }: { segments: RubySegment[] | null; fallback: string }) {
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
function Front({ card, mode }: { card: Card; mode: FrontMode }) {
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
function Back({ card, mode }: { card: Card; mode: FrontMode }) {
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

  /*
   * The deck IS the session, and its head is the card on screen — there is no
   * cursor, because nothing moves through the deck any more: a card is either
   * answered and gone, or answered and sent to the back.
   *
   * Seeded from the server once and deliberately never re-synced. `cards` is a
   * fresh selection on every call, so adopting a later one would hand back
   * words already answered and reset the count.
   */
  const [deck, setDeck] = useState(cards);

  const card = deck[0];

  /*
   * A passed card leaves the deck; "again" sends it to the back instead, so
   * the counter tracks words not yet recalled rather than cards seen. Both
   * schedule their state change before the transition, never inside it — an
   * update scheduled inside an async transition is withheld until the write
   * settles, which is the opposite of optimistic.
   */
  function handleGrade(grade: Grade) {
    const graded = card;
    const passed = grade !== "again";

    setFlipped(false);
    setDeck((d) => {
      const rest = d.filter((c) => c.entryId !== graded.entryId);
      return passed ? rest : [...rest, graded];
    });

    startTransition(async () => {
      try {
        const previews = await gradeCard(graded.entryId, grade);
        // The re-queued card comes back later in this session, so its buttons
        // have to describe where it is now, not where it was.
        if (!passed && previews) {
          setDeck((d) =>
            d.map((c) =>
              c.entryId === graded.entryId ? { ...c, previews } : c,
            ),
          );
        }
      } catch (error) {
        console.error(error);
        // Back to the head, so the word the user believes they answered is the
        // one the toast is about.
        setDeck((d) => [graded, ...d.filter((c) => c.entryId !== graded.entryId)]);
        toast.add({
          type: "error",
          title: "Couldn't save",
          description: "Check your connection and try again.",
        });
      }
    });
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

      {/*
        Keyed on the entry id so a new card is a new element: the outgoing one
        fades while the incoming one rises, which reads as a deck rather than
        text being swapped in place.
      */}
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

      {/*
        One row, two states, one height. Grading a word you have not tried to
        recall is not a review, so the grades genuinely cannot be here yet —
        but a row of dead buttons reads as a broken control rather than a
        locked one. The space holds the actual next step instead.
      */}
      <div className="mt-6">
        {flipped ? (
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((grade) => (
              /*
                All four weighted the same. Anki fills "Good" because Space is
                bound to it — the fill says what the default key does. There is
                no such binding here, so a fill would only be a thumb on the
                scale: these are four honest answers to "how well did you know
                it", not one recommended action with three alternatives, and
                nudging a torn user toward Good feeds the scheduler a grade they
                did not mean.
              */
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
