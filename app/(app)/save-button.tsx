"use client";

import { useOptimistic, useTransition } from "react";

import { addWord, removeWord, setStatus } from "@/app/actions/words";

/**
 * Toggles a word in and out of the user's list.
 *
 * `useOptimistic` flips the label immediately so the button feels instant; the
 * server action's `refresh()` reconciles it, and React rolls the optimistic
 * value back on its own if the action throws.
 */
export function SaveButton({
  entryId,
  saved,
}: {
  entryId: number;
  saved: boolean;
}) {
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(saved);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={optimisticSaved}
      onClick={() => {
        startTransition(async () => {
          setOptimisticSaved(!optimisticSaved);
          if (optimisticSaved) {
            await removeWord(entryId);
          } else {
            await addWord(entryId);
          }
        });
      }}
      className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        optimisticSaved
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
          : "border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      }`}
    >
      {optimisticSaved ? "Saved" : "Save"}
    </button>
  );
}

/** Moves a word between the todo and learned buckets. */
export function StatusButton({
  entryId,
  status,
}: {
  entryId: number;
  status: "todo" | "learned";
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const next = optimisticStatus === "learned" ? "todo" : "learned";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          setOptimisticStatus(next);
          await setStatus(entryId, next);
        });
      }}
      className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
    >
      {optimisticStatus === "learned" ? "Mark unlearned" : "Mark learned"}
    </button>
  );
}
