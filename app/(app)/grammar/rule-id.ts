/**
 * Parses the `[id]` segment of a grammar URL, returning null for anything that
 * is not a uuid.
 *
 * The `parseEntryId` lesson in the same shape: the parsed value reaches
 * Postgres as a bind parameter, and an unguarded `/grammar/wat` comes back as
 * `invalid input syntax for type uuid` — a URL that should have been a 404
 * becoming a 500 instead.
 *
 * Only the canonical lowercase hyphenated form is accepted. `gen_random_uuid()`
 * emits nothing else, so a stricter match costs no real URL and keeps one rule
 * from having two addresses.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseRuleId(raw: string): string | null {
  return UUID.test(raw) ? raw : null;
}
