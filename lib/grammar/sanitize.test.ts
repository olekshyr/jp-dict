// @vitest-environment node

import { describe, expect, it } from "vitest";

import { sanitizeBody } from "./sanitize";

describe("sanitizeBody", () => {
  /*
   * The fixtures here are what CKEditor's downcast *actually emits*, not the
   * equivalent markup a person would write. That distinction caught a real bug:
   * Italic downcasts to `<i>` and only upcasts `<em>`, so an allowlist holding
   * `em` alone silently dropped every italic on save. Check the downcast
   * `view:` in the plugin source before adding a toolbar button here.
   */
  it.each([
    ["bold", "<p>a <strong>x</strong> b</p>"],
    ["italic", "<p>a <i>x</i> b</p>"],
    ["underline", "<p>a <u>x</u> b</p>"],
    ["strikethrough", "<p>a <s>x</s> b</p>"],
    ["code", "<p>a <code>x</code> b</p>"],
    ["heading2", "<h2>x</h2>"],
    ["heading3", "<h3>x</h3>"],
    ["bulletedList", "<ul><li>x</li></ul>"],
    ["numberedList", "<ol><li>x</li></ol>"],
    ["blockQuote", "<blockquote><p>x</p></blockquote>"],
  ])("survives a round trip through the %s button", (_label, html) => {
    expect(sanitizeBody(html).body).toBe(html);
  });

  it("keeps em too, which only pasted markup produces", () => {
    expect(sanitizeBody("<p><em>x</em></p>").body).toBe("<p><em>x</em></p>");
  });

  it("keeps the formatting the editor toolbar can produce", () => {
    const raw =
      "<h2>Formula</h2><p><strong>bold</strong> <em>em</em> <s>struck</s> " +
      "<u>under</u> <code>code</code></p><ul><li>one</li></ul>" +
      "<ol><li>two</li></ol><blockquote><p>quoted</p></blockquote>";

    expect(sanitizeBody(raw).body).toBe(raw);
  });

  it("discards a script tag entirely rather than escaping it", () => {
    const { body, bodyText } = sanitizeBody(
      "<p>before</p><script>alert(1)</script><p>after</p>",
    );

    expect(body).toBe("<p>before</p><p>after</p>");
    // `discard`, not `escape`: the source text must not resurface as prose.
    expect(bodyText).toBe("before after");
  });

  it("drops event handlers, styles and classes", () => {
    const { body } = sanitizeBody(
      '<p onclick="steal()" style="color:red" class="x">text</p>',
    );

    expect(body).toBe("<p>text</p>");
  });

  it("drops a javascript: href but keeps the link text", () => {
    const { body } = sanitizeBody('<p><a href="javascript:alert(1)">go</a></p>');

    expect(body).not.toContain("javascript:");
    expect(body).toContain("go");
  });

  it("forces rel and target on an allowed link", () => {
    const { body } = sanitizeBody('<p><a href="https://example.com">go</a></p>');

    expect(body).toContain('href="https://example.com"');
    expect(body).toContain('rel="noopener noreferrer nofollow"');
    expect(body).toContain('target="_blank"');
  });

  it("drops embedded and image tags", () => {
    const { body } = sanitizeBody(
      '<iframe src="https://evil.test"></iframe><img src=x onerror="alert(1)">',
    );

    expect(body).toBe("");
  });

  it("collapses a body with no text to empty", () => {
    // What the editor emits for a field the user never typed in.
    expect(sanitizeBody("<p>&nbsp;</p>")).toEqual({ body: "", bodyText: "" });
    expect(sanitizeBody("<p></p>")).toEqual({ body: "", bodyText: "" });
    expect(sanitizeBody("")).toEqual({ body: "", bodyText: "" });
  });

  it("separates blocks in the plain text but not inline tags", () => {
    // The block boundary is real and has to become a space, or `?q` matches
    // across a word that isn't there. The inline one is not: an unconditional
    // space would put a gap in the middle of a sentence.
    expect(sanitizeBody("<p>one</p><p>two</p>").bodyText).toBe("one two");
    expect(sanitizeBody("<ul><li>a</li><li>b</li></ul>").bodyText).toBe("a b");
    expect(sanitizeBody("<p>100% <em>sure</em>.</p>").bodyText).toBe(
      "100% sure.",
    );
    expect(sanitizeBody("<p>very <strong>very</strong> good</p>").bodyText).toBe(
      "very very good",
    );
  });

  it("does not split an entity into separate words", () => {
    // htmlparser2 emits each entity reference as its own text event, so the
    // block separator used to land in the middle of a word: "R&D" was stored as
    // "R & D" and `?q=R&D` matched nothing.
    expect(sanitizeBody("<p>R&amp;D notes</p>").bodyText).toBe("R&D notes");
    expect(sanitizeBody("<p>2&lt;3</p>").bodyText).toBe("2<3");
    expect(sanitizeBody("<p>a&gt;b and c&amp;d</p>").bodyText).toBe(
      "a>b and c&d",
    );
  });

  it("derives plain text with entities decoded and whitespace collapsed", () => {
    const { bodyText } = sanitizeBody(
      "<h2>てしまう</h2>\n<p>Tom &amp;   Jerry</p>",
    );

    expect(bodyText).toBe("てしまう Tom & Jerry");
  });
});
