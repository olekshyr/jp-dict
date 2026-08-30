"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createRule, updateRule } from "@/app/actions/grammar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useNavPending } from "../nav-pending";
import { RichTextEditor } from "./rich-text-editor";

const MAX_TITLE = 200;
const MAX_BODY = 20_000;

const FAILED = {
  type: "error",
  title: "Couldn't save",
  description: "Check your connection and try again.",
} as const;

export function RuleForm({
  rule,
  onSaved,
  onCancel,
}: Readonly<{
  rule?: { id: string; title: string; body: string };
  /** Receives the *sanitized* body the action returned, not the editor's. */
  onSaved?: (title: string, body: string) => void;
  onCancel?: () => void;
}>) {
  const router = useRouter();
  const { startNavigation } = useNavPending();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const body = useRef(rule?.body ?? "");

  useEffect(() => {
    form.current?.reset();
    body.current = rule?.body ?? "";
  }, [rule?.body]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(
      new FormData(event.currentTarget).get("title") ?? "",
    ).trim();

    if (title === "") {
      setError("Give the rule a title.");
      return;
    }
    if (body.current.length > MAX_BODY) {
      setError("This rule is too long. Shorten it and try again.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        if (rule) {
          const saved = await updateRule(rule.id, title, body.current);
          // null means the row is gone — deleted in another tab, most likely.
          if (!saved) {
            toast.add({
              type: "error",
              title: "Couldn't save",
              description: "This rule no longer exists.",
            });
            return;
          }
          onSaved?.(title, saved.body);
          return;
        }

        const created = await createRule(title, body.current);
        startNavigation(() => router.push(`/grammar/${created.id}`));
      } catch (error) {
        console.error(error);
        toast.add(FAILED);
      }
    });
  };

  return (
    <form
      ref={form}
      onSubmit={handleSubmit}
      onReset={() => setError(null)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <Input
          name="title"
          defaultValue={rule?.title ?? ""}
          maxLength={MAX_TITLE}
          placeholder="〜てしまう"
          aria-label="Title"
          aria-invalid={error !== null}
          autoComplete="off"
          autoFocus
          className="h-11 text-base md:text-base"
        />
        <p aria-live="polite" className="min-h-4 text-xs text-destructive">
          {error}
        </p>
      </div>

      <RichTextEditor
        initialValue={rule?.body ?? ""}
        onChange={(html) => {
          body.current = html;
        }}
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
