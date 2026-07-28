"use client";

import { useOptimistic, useTransition } from "react";

import { addWord, removeWord } from "@/app/actions/words";
import { Button } from "@/components/ui/button";

export function SaveButton({
  entryId,
  saved,
  size = "xs",
}: Readonly<{
  entryId: number;
  saved: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
}>) {
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(saved);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={optimisticSaved ? "secondary" : "default"}
      size={size}
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
