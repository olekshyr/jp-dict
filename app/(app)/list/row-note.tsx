"use client";

import { useId, useState } from "react";
import { NotebookPenIcon } from "lucide-react";

import { NoteEditor } from "../note-editor";

/**
 * A row's note on /list: collapsed to its first line, edited in place.
 *
 * The preview line is the toggle — clicking the note opens the very text you
 * clicked, and clicking again closes it. Truncation is CSS (`line-clamp-1`)
 * rather than a slice, which would happily cut a surrogate pair in half.
 *
 * A word without a note renders nothing at all: this surface exists to show
 * notes that exist, and a row of "Add note" affordances on a list where most
 * words have none is noise. Writing the first note is the entry page's job,
 * where the field is open by default.
 */
export function RowNote({
  entryId,
  note,
}: Readonly<{
  entryId: number;
  note: string | null;
}>) {
  // The committed note, owned here so the preview reflects an edit without a
  // server round-trip; <NoteEditor> reports each commit — and each rollback —
  // back through onCommit.
  const [current, setCurrent] = useState(note ?? "");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // `open` is part of the condition so that clearing a note mid-edit doesn't
  // yank the field out from under the cursor — the row keeps it until the user
  // collapses it, and only then goes quiet.
  if (!current && !open) return null;

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // Collapsing on the same control the textarea sits under means the
        // textarea blurs on this button's mousedown, so its commit is already
        // in flight by the time the click lands. The editor's unmount flush
        // covers the orders where it isn't.
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full min-w-0 items-center gap-1.5 text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <NotebookPenIcon className="size-3.5 shrink-0" />
        {open ? (
          <span>Hide note</span>
        ) : (
          <span className="line-clamp-1">{current}</span>
        )}
      </button>

      {open && (
        <div id={panelId} className="mt-1.5">
          <NoteEditor
            entryId={entryId}
            note={current}
            onCommit={setCurrent}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
