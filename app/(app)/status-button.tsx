"use client";

import { useState, useTransition } from "react";

import { setStatus } from "@/app/actions/words";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useRow } from "./row-context";

/** Takes a word out of review rotation, or puts it back. */
export function StatusButton({
  entryId,
  status,
}: {
  entryId: number;
  status: "todo" | "learned";
}) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const row = useRow();
  const next = current === "learned" ? "todo" : "learned";

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
      {current === "learned" ? "Put back" : "Retire"}
    </Button>
  );
}
