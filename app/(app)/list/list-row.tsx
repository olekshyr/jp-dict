"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { WordStatus } from "@/lib/user-words/queries";
import { RowContext, type RowApi } from "../row-context";
import { useListDispatch, type CountDelta } from "./list-session";

const moveDelta = (to: WordStatus): CountDelta =>
  to === "learned" ? { todo: -1, learned: 1 } : { todo: 1, learned: -1 };

const dropDelta = (status: WordStatus): CountDelta =>
  status === "learned" ? { todo: 0, learned: -1 } : { todo: -1, learned: 0 };

/**
 * One row's optimistic state.
 *
 * The row owns whether it is still on the page, rather than a set of removed
 * ids in a provider that every row would subscribe to: removing row 7 must
 * re-render row 7 and nothing else. Rows only ever *write* to the session, via
 * the identity-stable dispatch, so a count change never reaches them.
 */
export function ListRow({
  filter,
  status,
  children,
}: Readonly<{
  filter: WordStatus | "all";
  status: WordStatus;
  children: React.ReactNode;
}>) {
  const dispatch = useListDispatch();
  const [removed, setRemoved] = useState(false);
  const [current, setCurrent] = useState(status);
  // A ref, not state: nothing renders from it, and a write must not re-render.
  // `token` identifies which write this undo belongs to: the two buttons in a
  // row are separate components and can both be in flight at once, so
  // "whichever wrote here last" is not enough to tell a rollback which write
  // it is undoing — see Fix 1 in the optimistic-writes review.
  const undo = useRef<{ delta: CountDelta; status: WordStatus; token: symbol } | null>(
    null,
  );

  const api = useMemo<RowApi>(
    () => ({
      setStatus(to) {
        const delta = moveDelta(to);
        const token = Symbol("setStatus");
        undo.current = { delta, status: current, token };
        dispatch(delta);
        setCurrent(to);
        // A row that no longer matches the active filter does not belong on
        // this page. Under `all` every bucket matches, so it stays put and only
        // its button label flips.
        if (filter !== "all" && to !== filter) setRemoved(true);
        return token;
      },
      unsave() {
        const delta = dropDelta(current);
        const token = Symbol("unsave");
        undo.current = { delta, status: current, token };
        dispatch(delta);
        setRemoved(true);
        return token;
      },
      rollback(token) {
        const last = undo.current;
        if (!last || token === undefined || last.token !== token) return;
        dispatch({ todo: -last.delta.todo, learned: -last.delta.learned });
        setCurrent(last.status);
        setRemoved(false);
        undo.current = null;
      },
    }),
    [current, dispatch, filter],
  );

  return (
    <AnimatePresence initial={false}>
      {!removed && (
        <motion.div
          // role="presentation": ItemGroup is role="list" and WordItem is
          // role="listitem" (components/ui/item.tsx, word-item.tsx) — without
          // this, this wrapper is an unlabelled generic sitting between them
          // and screen readers lose list containment entirely.
          role="presentation"
          // Height as well as opacity, animated to a *negative* margin equal
          // to ItemGroup's `gap-4`: the wrapper and Item both start at
          // `margin: 0`, so animating height alone would leave the 1rem gap to
          // snap shut the instant the node unmounts. Ending at `-1rem` cancels
          // that gap over the same transition, so the rows below close it
          // smoothly instead of jumping.
          initial={false}
          exit={{ opacity: 0, height: 0, marginBottom: "-1rem" }}
          transition={{ duration: 0.15 }}
          style={{ overflow: "hidden" }}
        >
          <RowContext value={api}>{children}</RowContext>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
