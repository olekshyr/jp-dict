import sanitizeHtml from "sanitize-html";

/*
 * The write boundary for `grammar_rules.body` — the one place this app stores
 * markup rather than text, and therefore the one place a sanitizer is the
 * control rather than a nicety. A Server Action is reachable by direct POST, so
 * whatever the editor happens to emit is irrelevant: this decides what can be
 * stored, and only what is stored is ever rendered.
 *
 * Not `server-only`, so it can be unit-tested in the node environment. Nothing
 * but the Server Action imports it, so it never reaches the browser bundle.
 */

/**
 * The allowlist, and the editor toolbar, are one decision written twice — the
 * same shape as `bucketOf` and the SQL `CASE`. A toolbar button whose tag is
 * missing here does not fail; it silently discards the user's formatting on
 * save. See `app/(app)/grammar/ckeditor-client.tsx`.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  /*
   * `i` is what the editor actually produces — CKEditor's Italic downcasts to
   * `<i>` and only *upcasts* `<em>`. `em` stays for pasted and hand-written
   * markup, which is the only thing that ever emits it.
   */
  "i",
  "em",
  "s",
  "u",
  "code",
  "pre",
  "blockquote",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "a",
] as const;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  /*
   * An anchor keeps `href` and the two attributes `transformTags` below forces
   * onto it. Nothing else carries anything: no `style`, no `class`, and — the
   * point of the exercise — no `on*`, since an allowlist that names what
   * survives cannot be outflanked by an event handler nobody thought of.
   *
   * `rel` and `target` have to be named here as well as set below. Attribute
   * filtering runs *after* `transformTags`, so a forced attribute that is not
   * allowed is added and then immediately stripped.
   */
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  // `discard`, not `escape`: a stripped <script> should leave nothing at all,
  // not its source text rendered as prose.
  disallowedTagsMode: "discard",
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
};

/** The allowlisted tags that sit inside a sentence rather than breaking it. */
const INLINE = new Set(["strong", "i", "em", "s", "u", "code", "a"]);

const TEXT_ONLY: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  /*
   * Stripping the tags would otherwise weld the blocks together — `<p>one</p>
   * <p>two</p>` becoming "onetwo", which reads wrong in an excerpt and makes
   * `?q` match across a boundary that isn't there. So a text node gets a
   * trailing space, collapsed by the `\s+` pass below.
   *
   * Except inside an inline tag, where the boundary isn't real: an unconditional
   * space turns `<em>hypothetical</em>.` into "hypothetical ." and puts a gap
   * into the middle of a sentence, both in the excerpt and in the `?q` haystack.
   * `textFilter` names the *parent* tag, which is exactly the distinction.
   */
  textFilter: (text, tagName) => (INLINE.has(tagName) ? text : `${text} `),
  /*
   * Off, because htmlparser2 emits each entity reference as its own text event
   * and `textFilter` runs per event, not per node — so decoding here split
   * `R&amp;D` into three chunks and the rule above put a space between each,
   * storing "R & D". `?q=R&D` then matched nothing.
   *
   * Safe to leave the decoding to the pass below precisely because the input
   * here is the *first* pass's output rather than arbitrary HTML: that pass
   * decodes every entity the user wrote and re-encodes only `&`, `<` and `>`,
   * which is exactly the three `ENTITIES` covers. A `&nbsp;` has already become
   * a literal U+00A0 by this point, which is why an empty body still collapses.
   */
  parser: { decodeEntities: false },
};

/*
 * sanitize-html escapes `&`, `<` and `>` on the way out, so its own text output
 * comes back with entities in it. Decoding is safe *only* because the input to
 * this is that output and nothing else — a known encoder, not arbitrary HTML.
 *
 * One pass, not one replace per entity: `&amp;lt;` must come back as the
 * literal text `&lt;`, and sequential replaces would decode it twice into `<`.
 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
};

const decodeEntities = (text: string) =>
  text.replace(/&(?:amp|lt|gt);/g, (match) => ENTITIES[match]);

/**
 * Turns whatever arrived into the pair of columns the table stores.
 *
 * `bodyText` comes from a second pass of the same parser rather than a regex
 * strip: the excerpt and `?q` both read it, and a regex that thinks it
 * understands HTML is how a sanitizer bypass gets written by accident.
 *
 * An empty body collapses both fields to `""`, so `<p>&nbsp;</p>` — what the
 * editor emits for an untouched field — cannot make a rule look annotated. The
 * same collapse `setNote` does with whitespace.
 */
export function sanitizeBody(raw: string): { body: string; bodyText: string } {
  const body = sanitizeHtml(raw, OPTIONS);
  const bodyText = decodeEntities(sanitizeHtml(body, TEXT_ONLY))
    .replace(/\s+/g, " ")
    .trim();

  if (bodyText === "") return { body: "", bodyText: "" };
  return { body, bodyText };
}
