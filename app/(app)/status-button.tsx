"use client";

import { useOptimistic, useTransition } from "react";

import { setStatus } from "@/app/actions/words";
import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          setOptimisticStatus(next);
          await setStatus(entryId, next);
        });
      }}
    >
      {optimisticStatus === "learned" ? "Mark unlearned" : "Mark learned"}
    </Button>
  );
}
