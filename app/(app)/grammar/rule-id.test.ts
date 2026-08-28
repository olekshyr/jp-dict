// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseRuleId } from "./rule-id";

const VALID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("parseRuleId", () => {
  it("accepts a canonical uuid", () => {
    expect(parseRuleId(VALID)).toBe(VALID);
  });

  it.each([
    ["empty", ""],
    ["not a uuid", "abc"],
    ["uppercase", VALID.toUpperCase()],
    ["surrounding whitespace", ` ${VALID} `],
    ["trailing newline", `${VALID}\n`],
    ["path traversal", "../../etc/passwd"],
    ["sql-ish", `${VALID}'; drop table grammar_rules; --`],
    ["missing hyphens", VALID.replaceAll("-", "")],
  ])("rejects %s", (_label, raw) => {
    expect(parseRuleId(raw)).toBeNull();
  });
});
