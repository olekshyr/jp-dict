"use client";

import { useState, useTransition } from "react";

import { addWord, removeWord } from "@/app/actions/words";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useRow } from "./row-context";

export function SaveButton({
  entryId,
  saved,
  size = "xs",
}: Readonly<{
  entryId: number;
  saved: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
}>) {
  // `saved` seeds this and nothing re-seeds it: the action no longer refreshes
  // the route, so the button is the authority on its own label until the next
  // navigation re-renders it from the database.
  const [isSaved, setIsSaved] = useState(saved);
  const [pending, startTransition] = useTransition();
  const row = useRow();

  return (
    <Button
      type="button"
      variant={isSaved ? "secondary" : "default"}
      size={size}
      disabled={pending}
      aria-pressed={isSaved}
      onClick={() => {
        const next = !isSaved;
        setIsSaved(next);
        // On /list an unsave takes the row off the page; on /search there is no
        // row and this is a no-op.
        const token = !next ? row?.unsave() : undefined;
        startTransition(async () => {
          try {
            if (next) {
              await addWord(entryId);
            } else {
              await removeWord(entryId);
            }
          } catch (error) {
            console.error(error);
            setIsSaved(!next);
            // Mirrors the forward guard above: only an unsave wrote an undo
            // for this row, so only an unsave's failure replays it.
            if (!next) row?.rollback(token);
            toast.add({
              type: "error",
              title: "Couldn't save",
              description: "Check your connection and try again.",
            });
          }
        });
      }}
    >
      {isSaved ? "Saved" : "Save"}
    </Button>
  );
}
