"use client";

import React, { useState, useTransition } from "react";
import { SaveIcon, SaveCheck } from "lucide-react";

import { addWord, removeWord } from "@/app/actions/words";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useRow } from "./row-context";
import { useSaved } from "./saved-context";

export function SaveButton({
  entryId,
  saved,
  size = "xs",
}: Readonly<{
  entryId: number;
  saved: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
}>) {
  const [isSaved, setIsSaved] = useState(saved);
  const [pending, startTransition] = useTransition();
  const row = useRow();
  const entry = useSaved();

  const Icon = isSaved ? SaveCheck : SaveIcon;

  const handleClick = () => {
    const next = !isSaved;
    setIsSaved(next);
    entry?.setSaved(next);
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
        entry?.setSaved(!next);
        if (!next) row?.rollback(token);
        toast.add({
          type: "error",
          title: "Couldn't save",
          description: "Check your connection and try again.",
        });
      }
    });
  }

  return (
    <Button
      type="button"
      variant={isSaved ? "secondary" : "default"}
      size={size}
      disabled={pending}
      aria-pressed={isSaved}
      onClick={handleClick}
    >
      <Icon
        data-icon="inline-start"
        className="translate-y-[-4%]"
      />
      {isSaved ? "Saved" : "Save"}
    </Button>
  );
}
