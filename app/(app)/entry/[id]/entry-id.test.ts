// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseEntryId } from "./entry-id";

describe("parseEntryId", () => {
  it("accepts a canonical id", () => {
    expect(parseEntryId("1467640")).toBe(1467640);
  });

  it.each(["abc", "", " ", "-5", "0", "1.5", "NaN", "Infinity"])(
    "rejects %o",
    (raw) => {
      expect(parseEntryId(raw)).toBeNull();
    },
  );

  // `Number` reads all of these as integers, and every one of them would reach
  // the database: the exponent forms serialize to `1e+21`, which Postgres
  // rejects outright.
  it.each(["1e21", "1e3", "0x10", "0b101", "1_000"])(
    "rejects the non-decimal integer %o",
    (raw) => {
      expect(parseEntryId(raw)).toBeNull();
    },
  );

  // Not correctness so much as cache hygiene: `getEntry` is `use cache` keyed on
  // the id, so two spellings of one entry would mean two cache entries.
  it.each(["007", " 7", "7 ", "+7"])(
    "rejects the non-canonical spelling %o",
    (raw) => {
      expect(parseEntryId(raw)).toBeNull();
    },
  );

  it("rejects an id past the safe integer range", () => {
    expect(parseEntryId("9007199254740993")).toBeNull();
  });
});
