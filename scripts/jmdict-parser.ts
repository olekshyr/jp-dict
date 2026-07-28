import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import sax from "sax";

/**
 * Streaming JMdict XML parser.
 *
 * JMdict_e.xml is ~60MB with ~214k entries, so it is parsed as a stream rather
 * than a DOM. Entries are handed to a callback one at a time and never all held
 * in memory at once.
 */

export type KanjiForm = {
  text: string;
  info: string[];
  priority: string[];
};

export type Reading = {
  kana: string;
  noKanji: boolean;
  restrictions: string[];
  info: string[];
  priority: string[];
};

export type Gloss = {
  text: string;
  type: string | null;
};

export type Sense = {
  pos: string[];
  field: string[];
  misc: string[];
  dialect: string[];
  info: string | null;
  glosses: Gloss[];
};

export type JMdictEntry = {
  seq: number;
  kanji: KanjiForm[];
  readings: Reading[];
  senses: Sense[];
};

/**
 * Reads the `<!ENTITY name "description">` declarations out of the DTD.
 *
 * JMdict writes part-of-speech and friends as custom entities (`<pos>&n;</pos>`).
 * sax knows only the five predefined XML entities, so these must be registered
 * explicitly or every `<pos>` silently comes back empty. We map each name to
 * *itself* so `&n;` resolves to the short tag `"n"` — the canonical JMdict tag,
 * and what gets stored. lib/dictionary/tags.ts expands it for display.
 */
export async function readDtdEntities(
  xmlPath: string,
): Promise<Record<string, string>> {
  const entities: Record<string, string> = {};
  const rl = createInterface({
    input: createReadStream(xmlPath, { encoding: "utf8" }),
  });
  const ENTITY_RE = /^<!ENTITY\s+([\w-]+)\s+"([^"]*)">/;

  for await (const line of rl) {
    const match = ENTITY_RE.exec(line.trim());
    if (match) entities[match[1]] = match[1];
    if (line.includes("<JMdict>")) break;
  }
  rl.close();

  return entities;
}

/**
 * Parses the XML, invoking `onEntry` for each `<entry>`.
 *
 * If `onEntry` returns a promise the source stream is paused until it settles,
 * so a consumer can flush a batch to the database without buffering all ~1.5M
 * rows in memory first.
 */
export function parseJMdict(
  xmlPath: string,
  entities: Record<string, string>,
  onEntry: (entry: JMdictEntry) => void | Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: true });
    const source = createReadStream(xmlPath);

    // sax exposes its entity table on the underlying parser.
    Object.assign(parser._parser.ENTITIES, entities);

    let entry: JMdictEntry | null = null;
    let kanji: KanjiForm | null = null;
    let reading: Reading | null = null;
    let sense: Sense | null = null;
    let glossType: string | null = null;
    let text = "";

    parser.on("opentag", (node) => {
      text = "";
      switch (node.name) {
        case "entry":
          entry = { seq: 0, kanji: [], readings: [], senses: [] };
          break;
        case "k_ele":
          kanji = { text: "", info: [], priority: [] };
          break;
        case "r_ele":
          reading = {
            kana: "",
            noKanji: false,
            restrictions: [],
            info: [],
            priority: [],
          };
          break;
        case "sense":
          sense = {
            pos: [],
            field: [],
            misc: [],
            dialect: [],
            info: null,
            glosses: [],
          };
          break;
        case "re_nokanji":
          if (reading) reading.noKanji = true;
          break;
        case "gloss": {
          const attrs = node.attributes as Record<string, string>;
          glossType = attrs.g_type ?? null;
          break;
        }
      }
    });

    // Entity-resolved text arrives via a separate event from ordinary text, and
    // either may fire more than once per element, so both accumulate.
    parser.on("text", (chunk) => {
      text += chunk;
    });
    parser.on("cdata", (chunk) => {
      text += chunk;
    });

    parser.on("closetag", (name) => {
      switch (name) {
        case "ent_seq":
          if (entry) entry.seq = Number(text);
          break;

        case "keb":
          if (kanji) kanji.text = text;
          break;
        case "ke_inf":
          if (kanji) kanji.info.push(text);
          break;
        case "ke_pri":
          if (kanji) kanji.priority.push(text);
          break;
        case "k_ele":
          if (entry && kanji) entry.kanji.push(kanji);
          kanji = null;
          break;

        case "reb":
          if (reading) reading.kana = text;
          break;
        case "re_restr":
          if (reading) reading.restrictions.push(text);
          break;
        case "re_inf":
          if (reading) reading.info.push(text);
          break;
        case "re_pri":
          if (reading) reading.priority.push(text);
          break;
        case "r_ele":
          if (entry && reading) entry.readings.push(reading);
          reading = null;
          break;

        case "pos":
          if (sense) sense.pos.push(text);
          break;
        case "field":
          if (sense) sense.field.push(text);
          break;
        case "misc":
          if (sense) sense.misc.push(text);
          break;
        case "dial":
          if (sense) sense.dialect.push(text);
          break;
        case "s_inf":
          if (sense) sense.info = text;
          break;
        case "gloss":
          if (sense && text) sense.glosses.push({ text, type: glossType });
          glossType = null;
          break;
        case "sense":
          if (entry && sense) entry.senses.push(sense);
          sense = null;
          break;

        case "entry":
          if (entry) {
            const pending = onEntry(entry);
            if (pending) {
              // Backpressure: stop reading until the consumer has flushed. The
              // in-flight chunk still finishes parsing, so the consumer may
              // overshoot its batch slightly — harmless, and far cheaper than
              // holding the whole dictionary in memory.
              source.pause();
              pending.then(() => source.resume(), reject);
            }
          }
          entry = null;
          break;
      }
      text = "";
    });

    parser.on("error", reject);
    parser.on("end", resolve);
    source.on("error", reject);

    source.pipe(parser);
  });
}
