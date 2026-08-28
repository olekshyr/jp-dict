"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Trash2Icon } from "lucide-react";

import { deleteRule } from "@/app/actions/grammar";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { toast } from "@/components/ui/toast";
import { LinkPending } from "../link-pending";

/**
 * One rule in the list, removable in place.
 *
 * The row owns whether it is still on the page, the way `ListRow` does, so
 * deleting row 7 re-renders row 7 and nothing else.
 *
 * Deliberately no equivalent of /list's `ListSession`: the only count this page
 * derives is `total`, it feeds nothing but the pagination links, and one
 * deletion cannot change which of those render unless it empties the page —
 * which the next navigation corrects anyway. /list needed the delta session
 * because it renders four count badges the user can see.
 */
export function RuleRow({
  id,
  title,
  excerpt,
}: Readonly<{
  id: string;
  title: string;
  excerpt: string;
}>) {
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    // Scheduled outside startTransition on purpose: an update made inside an
    // async transition callback is withheld until the promise settles, which is
    // the opposite of optimistic.
    setRemoved(true);
    startTransition(async () => {
      try {
        await deleteRule(id);
      } catch (error) {
        console.error(error);
        setRemoved(false);
        toast.add({
          type: "error",
          title: "Couldn't delete",
          description: "Check your connection and try again.",
        });
      }
    });
  };

  return (
    <AnimatePresence initial={false}>
      {!removed && (
        <motion.div
          // ItemGroup is role="list" and Item is role="listitem"; without this
          // the wrapper is an unlabelled generic between them and screen
          // readers lose list containment.
          role="presentation"
          initial={false}
          // Ends at a negative margin equal to ItemGroup's `gap-4`, so the rows
          // below close the gap over the same transition rather than snapping
          // shut when the node unmounts.
          exit={{ opacity: 0, height: 0, marginBottom: "-1rem" }}
          transition={{ duration: 0.15 }}
          style={{ overflow: "hidden" }}
        >
          <Item
            role="listitem"
            variant="outline"
            className="items-start transition-colors hover:border-ring"
          >
            <ItemContent className="min-w-0">
              <ItemTitle>
                <Link href={`/grammar/${id}`} className="relative hover:underline">
                  {title}
                  <LinkPending />
                </Link>
              </ItemTitle>
              {excerpt && (
                // `line-clamp`, not a slice: a slice happily cuts a surrogate
                // pair in half.
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {excerpt}
                </p>
              )}
            </ItemContent>

            <ItemActions>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={pending}
                aria-label={`Delete ${title}`}
                onClick={handleDelete}
              >
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            </ItemActions>
          </Item>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
