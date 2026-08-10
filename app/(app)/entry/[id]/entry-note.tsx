import { getSavedWord } from "@/lib/user-words/queries";
import { parseEntryId } from "./entry-id";
import { EntryNotePanel } from "./entry-note-panel";

/**
 * This user's note on a single entry, resolved per user.
 *
 * Its own component, and its own <Suspense> slot, for the same reason
 * <EntrySaveButton> is: <EntryBody> is `use cache` and shared by every user, so
 * anything request-time has to be handed to it as a pass-through slot.
 *
 * Takes the raw `id` string and parses it here so a junk URL never reaches the
 * query — <EntryBody> would call notFound(), but not before this had run.
 */
export async function EntryNote({ id }: { id: string }) {
  const entryId = parseEntryId(id);
  if (entryId === null) return null;

  const word = await getSavedWord(entryId);

  return (
    <EntryNotePanel
      entryId={entryId}
      saved={word !== null}
      note={word?.note ?? null}
    />
  );
}
