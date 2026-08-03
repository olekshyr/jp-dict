/**
 * Parses the `[id]` segment of an entry URL, returning null for anything that
 * is not a real entry id.
 *
 * Stricter than `Number.isInteger`, which is what this replaced, because the
 * parsed value reaches Postgres as a bind parameter: `1e21` is an integer to
 * JavaScript but serializes to `1e+21`, which the driver hands over as-is and
 * the server rejects with `invalid input syntax for type bigint` — a URL that
 * should have been a 404 becoming a 500 instead.
 *
 * Round-tripping through `String` is what narrows it to the canonical decimal
 * form, and that is worth having for its own sake: `getEntry` is `use cache`
 * keyed on the id, so `/entry/007` and `/entry/7` would otherwise be two cache
 * entries for one word.
 */
export function parseEntryId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return String(id) === raw ? id : null;
}
