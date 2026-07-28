"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";

import { setFrontMode, setStatus } from "@/app/actions/words";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import type { Card, FrontMode } from "@/lib/user-words/queries";
import type { RubySegment } from "@/lib/db/schema";

const MODES: Array<{ value: FrontMode; label: string }> = [
  { value: "kanji", label: "Kanji" },
  { value: "furigana", label: "Furigana" },
  { value: "romaji", label: "Romaji" },
  { value: "english", label: "English" },
];

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
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useOptimistic(initialMode);
  const [, startTransition] = useTransition();
  const [done, setDone] = useState<number[]>([]);

  const remaining = cards.filter((c) => !done.includes(c.entryId));
  const card = remaining[index];

  function advance() {
    setFlipped(false);
    setIndex((i) => (remaining.length <= 1 ? 0 : i % (remaining.length - 1)));
  }

  if (!card) {
    return (
      <div className="rounded-xl border py-16 text-center">
        <p className="text-lg">Session complete.</p>
        <Link
          href="/list"
          className="mt-4 inline-block text-sm underline underline-offset-4"
        >
          Back to my list
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ButtonGroup className="mb-6">
        <ButtonGroupText className="text-muted-foreground">
          Front:
        </ButtonGroupText>
        {MODES.map((m) => (
          <Button
            key={m.value}
            type="button"
            variant={mode === m.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              startTransition(async () => {
                setMode(m.value);
                setFlipped(false);
                await setFrontMode(m.value);
              });
            }}
          >
            {m.label}
          </Button>
        ))}
      </ButtonGroup>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show front" : "Reveal answer"}
        className="flex min-h-64 w-full items-center justify-center rounded-xl border p-8 transition-colors hover:border-ring"
      >
        {flipped ? (
          <Back card={card} mode={mode} />
        ) : (
          <Front card={card} mode={mode} />
        )}
      </button>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        {flipped ? "Tap to hide" : "Tap to reveal"} · {remaining.length} left
      </p>

      <ButtonGroup className="mx-auto mt-6">
        <Button type="button" variant="outline" onClick={advance}>
          Skip
        </Button>
        <Button
          type="button"
          onClick={() => {
            const id = card.entryId;
            startTransition(async () => {
              setDone((d) => [...d, id]);
              setFlipped(false);
              setIndex(0);
              await setStatus(id, "learned");
            });
          }}
        >
          I know this
        </Button>
      </ButtonGroup>
    </div>
  );
}
