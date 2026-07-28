"use client";

import { useOptimistic, useTransition } from "react";

import { addWord, removeWord } from "@/app/actions/words";
import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      variant={optimisticSaved ? "default" : "outline"}
      size="xs"
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
    >
      {optimisticSaved ? "Saved" : "Save"}
    </Button>
  );
}
