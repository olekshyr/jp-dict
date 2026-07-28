import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Extracts the `<!ENTITY name "description">` declarations from the JMdict DTD
 * and emits them as a TypeScript lookup table.
 *
 * Run with: pnpm tsx scripts/gen-tags.ts
 */

const XML_PATH = "data/JMdict_e.xml";
const OUT_PATH = "lib/dictionary/tags.ts";
const ENTITY_RE = /^<!ENTITY\s+([\w-]+)\s+"([^"]*)">/;

async function main() {
  // A Map, not an array: the DTD declares `ik` twice. Note that entity names
  // are case-sensitive — `ik` and `iK` are different tags.
  const byName = new Map<string, string>();
  const rl = createInterface({
    input: createReadStream(XML_PATH, { encoding: "utf8" }),
  });

  for await (const line of rl) {
    const match = ENTITY_RE.exec(line.trim());
    if (match) byName.set(match[1], match[2]);
    // The DTD ends where the document element begins.
    if (line.includes("<JMdict>")) break;
  }

  if (byName.size === 0) {
    throw new Error(`No <!ENTITY> declarations found in ${XML_PATH}`);
  }

  // Sort by codepoint so case-distinct names keep a stable, distinct order.
  const entities = [...byName.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  const body = entities
    .map(([name, desc]) => `  ${JSON.stringify(name)}: ${JSON.stringify(desc)},`)
    .join("\n");

  writeFileSync(
    OUT_PATH,
    `// GENERATED FILE — do not edit by hand.
// Source: the <!ENTITY> declarations in the JMdict DTD (${XML_PATH}).
// Regenerate with: pnpm tsx scripts/gen-tags.ts

/**
 * Maps a JMdict entity name to its human-readable description.
 *
 * The database stores the short name ("n", "v5r", "adj-i") rather than the
 * description, because these arrays repeat across ~200k rows. This table
 * expands them for display.
 */
export const JMDICT_TAGS: Record<string, string> = {
${body}
};

/** Expands a tag to its description, falling back to the raw tag. */
export function describeTag(tag: string): string {
  return JMDICT_TAGS[tag] ?? tag;
}
`,
  );

  console.log(`Wrote ${OUT_PATH} with ${entities.length} tags.`);
  console.log("Samples:", entities.slice(0, 3));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
