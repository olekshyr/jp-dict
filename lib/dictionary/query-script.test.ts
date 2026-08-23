// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  MAX_QUERY_LENGTH,
  clampQuery,
  detectScript,
  escapeLikeContains,
  escapeLikePrefix,
  normalizeJapanese,
  normalizeRomaji,
} from "./query-script";

describe("detectScript", () => {
  it.each(["", "   ", "\n\t"])("treats %o as empty", (raw) => {
    expect(detectScript(raw)).toBe("empty");
  });

  it.each(["猫", "ねこ", "ネコ", "日本語"])("routes %s as japanese", (raw) => {
    expect(detectScript(raw)).toBe("japanese");
  });

  it.each(["neko", "cat", "to eat"])("routes %o as latin", (raw) => {
    expect(detectScript(raw)).toBe("latin");
  });

  it("routes mixed input as japanese — one Japanese character is enough", () => {
    expect(detectScript("cat猫")).toBe("japanese");
  });
});

describe("clampQuery", () => {
  it("leaves a normal query untouched", () => {
    expect(clampQuery("ねこ")).toBe("ねこ");
  });

  it("trims, so a padded query keys the same cache entry", () => {
    expect(clampQuery("  neko  ")).toBe("neko");
  });

  it("truncates a query longer than the cap", () => {
    expect(clampQuery("a".repeat(5000))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it("counts code points, so truncation never splits a surrogate pair", () => {
    // Each emoji is two UTF-16 units, so a `.slice(MAX_QUERY_LENGTH)` would cut
    // half as many through the middle of one, leaving a lone surrogate to hand
    // to Postgres.
    expect(clampQuery("🐱".repeat(MAX_QUERY_LENGTH * 2))).toBe(
      "🐱".repeat(MAX_QUERY_LENGTH),
    );
  });
});

describe("escapeLikePrefix", () => {
  it("escapes a percent so it searches for the literal character", () => {
    expect(escapeLikePrefix("100%")).toBe("100\\%%");
  });

  it("escapes an underscore", () => {
    expect(escapeLikePrefix("a_b")).toBe("a\\_b%");
  });

  it("escapes a backslash", () => {
    expect(escapeLikePrefix("a\\b")).toBe("a\\\\b%");
  });

  it("trims before appending the wildcard", () => {
    expect(escapeLikePrefix("  cat  ")).toBe("cat%");
  });
});

describe("escapeLikeContains", () => {
  it("wraps the term in wildcards on both sides", () => {
    expect(escapeLikeContains("cat")).toBe("%cat%");
  });

  it.each([
    ["100%", "%100\\%%"],
    ["a_b", "%a\\_b%"],
    ["a\\b", "%a\\\\b%"],
  ])("escapes %o the same way the prefix form does", (raw, expected) => {
    expect(escapeLikeContains(raw)).toBe(expected);
  });

  it("trims before wrapping", () => {
    expect(escapeLikeContains("  cat  ")).toBe("%cat%");
  });
});

describe("normalizeJapanese", () => {
  it("folds katakana to hiragana so ネコ finds ねこ", () => {
    expect(normalizeJapanese("ネコ")).toBe("ねこ");
  });

  it("leaves hiragana alone", () => {
    expect(normalizeJapanese("ねこ")).toBe("ねこ");
  });

  it("passes kanji through untouched", () => {
    expect(normalizeJapanese("猫")).toBe("猫");
  });

  it("trims", () => {
    expect(normalizeJapanese("  ネコ  ")).toBe("ねこ");
  });
});

describe("normalizeRomaji", () => {
  it("lowercases to match the stored Hepburn form", () => {
    expect(normalizeRomaji("NEKO")).toBe("neko");
  });

  it("trims", () => {
    expect(normalizeRomaji("  neko  ")).toBe("neko");
  });
});
