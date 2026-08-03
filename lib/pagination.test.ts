// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PER_PAGE,
  MAX_PAGE,
  PER_PAGE_OPTIONS,
  pageCount,
  pageItems,
  paginationHref,
  parsePagination,
} from "./pagination";

describe("parsePagination", () => {
  it("accepts every offered page size", () => {
    for (const perPage of PER_PAGE_OPTIONS) {
      expect(parsePagination({ perPage: String(perPage) }).perPage).toBe(
        perPage,
      );
    }
  });

  it.each(["999999", "0", "-10", "abc", "", undefined])(
    "clamps perPage=%s back to the default",
    (perPage) => {
      expect(parsePagination({ perPage }).perPage).toBe(DEFAULT_PER_PAGE);
    },
  );

  it.each(["0", "-2", "1.5", "abc", "", undefined])(
    "clamps page=%s back to 1",
    (page) => {
      expect(parsePagination({ page })).toMatchObject({ page: 1, offset: 0 });
    },
  );

  it("derives offset from page and perPage", () => {
    expect(parsePagination({ page: "3", perPage: "20" })).toEqual({
      page: 3,
      perPage: 20,
      offset: 40,
    });
  });

  it("leaves a page past the end alone — clamping needs a total the caller owns", () => {
    expect(parsePagination({ page: "9999" }).page).toBe(9999);
  });

  // `page` becomes a bound OFFSET. Anything Postgres can't read as a bigint —
  // or that would make the offset absurd — has to be stopped here.
  it.each(["1e21", "9999999999999999999999", "99999999999999999999999999"])(
    "caps page=%s at MAX_PAGE rather than passing it to the query",
    (page) => {
      const { page: parsed, offset } = parsePagination({ page });
      expect(parsed).toBe(MAX_PAGE);
      expect(Number.isSafeInteger(offset)).toBe(true);
    },
  );

  it("keeps every offset it produces inside the safe integer range", () => {
    for (const perPage of PER_PAGE_OPTIONS) {
      const { offset } = parsePagination({
        page: String(Number.MAX_SAFE_INTEGER),
        perPage: String(perPage),
      });
      expect(Number.isSafeInteger(offset)).toBe(true);
      expect(String(offset)).not.toMatch(/e/);
    }
  });

  it.each(["Infinity", "1e309", "NaN"])(
    "clamps the non-finite page=%s back to 1",
    (page) => {
      expect(parsePagination({ page })).toMatchObject({ page: 1, offset: 0 });
    },
  );
});

describe("pageCount", () => {
  it("gives an empty list a page 1", () => {
    expect(pageCount(0, 10)).toBe(1);
  });

  it("does not add a trailing empty page on an exact multiple", () => {
    expect(pageCount(40, 10)).toBe(4);
  });

  it("rounds a partial last page up", () => {
    expect(pageCount(41, 10)).toBe(5);
  });
});

describe("pageItems", () => {
  it("lists every page when they all fit", () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
  });

  it("handles a single page", () => {
    expect(pageItems(1, 1)).toEqual([1]);
  });

  it("shows the page itself rather than an ellipsis for a gap of exactly one", () => {
    // Page 2 of 20: 1,2,3 then a real gap. Nothing is elided on the left,
    // because an ellipsis would take the same room to say less.
    expect(pageItems(2, 20)).toEqual([1, 2, 3, "ellipsis", 20]);
  });

  it("applies the same rule at the end of the range", () => {
    expect(pageItems(19, 20)).toEqual([1, "ellipsis", 18, 19, 20]);
  });

  it("elides both sides in the middle of a long range", () => {
    expect(pageItems(10, 20)).toEqual([
      1,
      "ellipsis",
      9,
      10,
      11,
      "ellipsis",
      20,
    ]);
  });

  it("fills a two-page gap on the left instead of eliding it", () => {
    expect(pageItems(3, 20)).toEqual([1, 2, 3, 4, "ellipsis", 20]);
  });
});

describe("paginationHref", () => {
  it("returns a bare pathname when nothing survives", () => {
    expect(paginationHref("/search", { page: 1, perPage: DEFAULT_PER_PAGE })).toBe(
      "/search",
    );
  });

  it("drops undefined and empty params", () => {
    expect(paginationHref("/list", { q: undefined, filter: "" })).toBe("/list");
  });

  it("drops page 1 but keeps the rest", () => {
    expect(paginationHref("/search", { q: "cat", page: 1 })).toBe(
      "/search?q=cat",
    );
  });

  it("keeps a page past the first", () => {
    expect(paginationHref("/search", { q: "cat", page: 3 })).toBe(
      "/search?q=cat&page=3",
    );
  });

  it("drops the default page size and keeps a non-default one", () => {
    expect(paginationHref("/list", { perPage: DEFAULT_PER_PAGE })).toBe("/list");
    expect(paginationHref("/list", { perPage: 50 })).toBe("/list?perPage=50");
  });

  it("percent-encodes a Japanese query", () => {
    expect(paginationHref("/search", { q: "猫" })).toBe(
      "/search?q=%E7%8C%AB",
    );
  });
});
