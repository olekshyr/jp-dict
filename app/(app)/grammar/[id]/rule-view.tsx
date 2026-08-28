"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { deleteRule } from "@/app/actions/grammar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useNavPending } from "../../nav-pending";
import { RuleBody } from "../rule-body";
import { RuleForm } from "../rule-form";

/**
 * One rule, read or edited in place.
 *
 * `title` and `body` seed this and nothing re-seeds them: the actions do not
 * refresh the route, so after an edit these props still describe the pre-write
 * row. The same arrangement `SaveButton`, `StatusButton` and `Flashcards` use.
 *
 * What it adopts after a save is the body the *action* returned, not the one
 * the editor produced — those differ wherever the sanitizer removed something,
 * and showing the editor's version would mean the page changed on next reload.
 */
export function RuleView({
  id,
  title,
  body,
}: Readonly<{
  id: string;
  title: string;
  body: string;
}>) {
  const router = useRouter();
  const { startNavigation } = useNavPending();
  const [current, setCurrent] = useState({ title, body });
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <RuleForm
        rule={{ id, ...current }}
        onSaved={(savedTitle, savedBody) => {
          setCurrent({ title: savedTitle, body: savedBody });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article>
      <header className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {current.title}
        </h1>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            // Disabled during a delete: otherwise the user can start editing,
            // and the navigation below then yanks them out of the form and
            // discards what they typed — into a rule that no longer exists.
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  await deleteRule(id);
                  // The list re-queries on arrival, so the deleted rule is
                  // simply not among the rows it renders.
                  startNavigation(() => router.push("/grammar"));
                } catch (error) {
                  console.error(error);
                  toast.add({
                    type: "error",
                    title: "Couldn't delete",
                    description: "Check your connection and try again.",
                  });
                }
              });
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
        </div>
      </header>

      <RuleBody html={current.body} />
    </article>
  );
}
