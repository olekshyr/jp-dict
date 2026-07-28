"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";

import { setFrontMode, setStatus } from "@/app/actions/words";
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
          <rt className="text-[0.35em] text-zinc-500">{segment.rt ?? ""}</rt>
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
        <div className="text-lg text-zinc-500">{card.reading}</div>
        <div className="font-mono text-sm text-zinc-400">{card.romaji}</div>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-center">
      <div className="text-xl">{card.glosses}</div>
      <div className="text-zinc-500">{card.reading}</div>
      <div className="font-mono text-sm text-zinc-400">{card.romaji}</div>
    </div>
  );
}

export function Flashcards({
  cards,
  initialMode,
}: {
  cards: Card[];
  initialMode: FrontMode;
}) {
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
      <div className="rounded-xl border border-zinc-200 py-16 text-center dark:border-zinc-800">
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
      <div className="mb-6 flex flex-wrap items-center gap-1">
        <span className="mr-2 text-sm text-zinc-500">Front:</span>
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => {
              startTransition(async () => {
                setMode(m.value);
                setFlipped(false);
                await setFrontMode(m.value);
              });
            }}
            className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
              mode === m.value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show front" : "Reveal answer"}
        className="flex min-h-64 w-full items-center justify-center rounded-xl border border-zinc-200 p-8 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
      >
        {flipped ? (
          <Back card={card} mode={mode} />
        ) : (
          <Front card={card} mode={mode} />
        )}
      </button>

      <p className="mt-3 text-center text-sm text-zinc-400">
        {flipped ? "Tap to hide" : "Tap to reveal"} · {remaining.length} left
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={advance}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:border-zinc-500 dark:border-zinc-700"
        >
          Skip
        </button>
        <button
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
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          I know this
        </button>
      </div>
    </div>
  );
}
