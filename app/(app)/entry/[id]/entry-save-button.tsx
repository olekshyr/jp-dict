import { getSavedEntryIds } from "@/lib/user-words/queries";
import { SaveButton } from "../../save-button";
import { parseEntryId } from "./entry-id";

/**
 * The save toggle for a single entry, with its saved state resolved per user.
 *
 * Deliberately its own component rather than part of <EntryBody>: that body is
 * `use cache`, so one entry has one cache entry shared by every user. Reading
 * whether *this* user saved the word has to happen outside it, which is why the
 * page passes this in as a pass-through slot behind its own <Suspense>.
 *
 * Takes the raw `id` string so it can bail out on a junk URL by itself, through
 * the same parser <EntryBody> uses. Without that, a junk id would reach the
 * query and blow up before <EntryBody> got the chance to call notFound().
 */
export async function EntrySaveButton({ id }: { id: string }) {
  const entryId = parseEntryId(id);
  if (entryId === null) return null;

  const savedIds = await getSavedEntryIds([entryId]);

  return (
    <SaveButton
      entryId={entryId}
      saved={savedIds.has(entryId)}
      size="default"
    />
  );
}
