"use client";

import { useSaved } from "../../saved-context";
import { NoteEditor } from "../../note-editor";

/**
 * The note block on an entry page — open by default, and absent entirely until
 * the word is in the user's list, since a note lives on the saved row.
 *
 * `saved` is the server's answer; the context carries an override so clicking
 * Save reveals this without a reload. Same seed-once discipline as the buttons:
 * the override wins as soon as there is one.
 */
export function EntryNotePanel({
  entryId,
  saved,
  note,
}: Readonly<{
  entryId: number;
  saved: boolean;
  note: string | null;
}>) {
  const override = useSaved()?.saved;
  if (!(override ?? saved)) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        My note
      </h2>
      <NoteEditor entryId={entryId} note={note} />
    </section>
  );
}
