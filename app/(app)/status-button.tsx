"use client";

import { useState, useTransition } from "react";

import { setStatus } from "@/app/actions/words";
import { STATUS, type WordStatus } from "@/lib/user-words/status";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useRow } from "./row-context";

/** Pauses reviews for a word, or resumes them. */
export function StatusButton({
  entryId,
  status,
}: {
  entryId: number;
  status: WordStatus;
}) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const row = useRow();
  const next = current === STATUS.paused ? STATUS.active : STATUS.paused;

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={pending}
      onClick={() => {
        setCurrent(next);
        const token = row?.setStatus(next);
        startTransition(async () => {
          try {
            await setStatus(entryId, next);
          } catch (error) {
            console.error(error);
            setCurrent(current);
            row?.rollback(token);
            toast.add({
              type: "error",
              title: "Couldn't save",
              description: "Check your connection and try again.",
            });
          }
        });
      }}
    >
      {current === STATUS.paused ? "Resume reviews" : "Pause reviews"}
    </Button>
  );
}
