// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  detectScript,
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
