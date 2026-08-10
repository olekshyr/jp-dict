"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { setNote } from "@/app/actions/words";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/** Matches `noteSchema` in app/actions/words.ts. That one is the control. */
const MAX_LENGTH = 2000;

const FAILED = {
  type: "error",
  title: "Couldn't save",
  description: "Check your connection and try again.",
} as const;

/**
 * A saved word's note, autosaved on blur.
 *
 * There is no Save button by design, so the write fires when the field loses
 * focus and the trimmed text actually changed. The status line under the field
 * carries what a button would otherwise have implied.
 */
export function NoteEditor({
  entryId,
  note,
  onCommit,
  autoFocus = false,
  label = "My note",
}: Readonly<{
  entryId: number;
  note: string | null;
  onCommit?: (note: string) => void;
  autoFocus?: boolean;
  label?: string;
}>) {
  // `note` seeds this and nothing re-seeds it. The action doesn't refresh the
  // route, so this field is the authority on its own text until a navigation
  // re-renders it from the database.
  const [value, setValue] = useState(note ?? "");
  /*
   * The same text, readable synchronously. Escape blurs the field in the very
   * event that reverts it, and blur runs before React has applied the state —
   * so a commit reading `value` from a render closure would write back the text
   * the user just abandoned. Every write to the state goes through
   * `applyValue`, so the two never drift.
   */
  const live = useRef(value);
  const applyValue = (next: string) => {
    live.current = next;
    setValue(next);
  };

  // The text last known to be in the database.
  const committed = useRef(note ?? "");
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  /*
   * `mounted` is false only on the unmount path. There the write cannot go
   * through startTransition — the component is gone, so its state updates are
   * no-ops and a rollback has nothing left to roll back. `toast` is a global
   * manager, so a failure still reaches the user; only the field's own revert
   * is lost, along with the text, which is the honest outcome for a field that
   * no longer exists.
   */
  const commit = (mounted: boolean) => {
    const next = live.current.trim();
    const prev = committed.current;
    if (next === prev) return;

    committed.current = next;
    onCommit?.(next);

    if (!mounted) {
      setNote(entryId, next).catch((error: unknown) => {
        console.error(error);
        toast.add(FAILED);
      });
      return;
    }

    setConfirmed(false);
    startTransition(async () => {
      try {
        await setNote(entryId, next);
        setConfirmed(true);
      } catch (error) {
        // The error, never the note: this is the user's personal text and has
        // no business in a log.
        console.error(error);
        committed.current = prev;
        applyValue(prev);
        onCommit?.(prev);
        toast.add(FAILED);
      }
    });
  };

  /*
   * React does not fire `blur` when it unmounts a focused element, so
   * collapsing the row on /list — or navigating away — while the field still
   * has focus would silently drop the edit. The cleanup reaches the current
   * `commit` through a ref rather than closing over the first one.
   */
  const flush = useRef(() => {});
  // Restated after every render, in an effect rather than in the render body:
  // writing a ref during render is what `react-hooks/refs` forbids.
  useEffect(() => {
    flush.current = () => commit(false);
  });
  useEffect(() => () => flush.current(), []);

  useEffect(() => {
    if (!confirmed) return;
    const timer = setTimeout(() => setConfirmed(false), 2000);
    return () => clearTimeout(timer);
  }, [confirmed]);

  const status = pending ? "Saving…" : confirmed ? "Saved" : null;

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        aria-label={label}
        value={value}
        maxLength={MAX_LENGTH}
        autoFocus={autoFocus}
        placeholder="Translation, a mnemonic, how you'd use it…"
        onChange={(e) => applyValue(e.target.value)}
        onBlur={() => commit(true)}
        onKeyDown={(e) => {
          // Escape abandons the edit. The blur it triggers then finds nothing
          // changed and writes nothing.
          if (e.key !== "Escape") return;
          applyValue(committed.current);
          e.currentTarget.blur();
        }}
      />
      {/* Holds its line whether or not there is a status, so committing a note
          doesn't shift whatever sits below it. */}
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
