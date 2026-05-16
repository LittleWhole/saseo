import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type LexiconDefinition = {
  text: string;
  pos: string[];
  examples: string[];
  tags: string[];
  formOf?: {
    form: string;
    reading?: string;
    label?: string;
  };
  sourceIds?: string[];
  confidence?: number;
};

type LexiconEntry = {
  id: string;
  hangul: string;
  hanja: string;
  alternateHanja?: string[];
  alternateForms?: Array<{
    form: string;
    reading?: string;
    label?: string;
  }>;
  searchForms?: Array<{
    form: string;
    reading?: string;
    label?: string;
  }>;
  definitions: LexiconDefinition[];
  provenance?: string[];
  confidence?: number;
  reviewStatus?: string;
};

type LexiconFile = {
  metadata?: Record<string, unknown>;
  entries: LexiconEntry[];
};

type HanjaCharacter = {
  character: string;
  meanings: string[];
  hun: string[];
  eum: string[];
  sources: string[];
};

type HanjaMetadata = {
  byChar: Map<string, HanjaCharacter>;
  cacheKey: string;
};

type IndexedEntry = LexiconEntry & {
  exactKeys: Set<string>;
  prefixKeys: string[];
  haystack: string;
  romaja: string;
  romajaLoose: string;
};

type SearchIndex = {
  metadata?: Record<string, unknown>;
  entries: IndexedEntry[];
  mtimeMs: number;
};

const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const MEDIALS = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
];
const FINALS = [
  "",
  "k",
  "k",
  "k",
  "n",
  "n",
  "n",
  "t",
  "l",
  "k",
  "m",
  "l",
  "l",
  "l",
  "p",
  "l",
  "m",
  "p",
  "p",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "t",
];

let cachedSearchIndex: SearchIndex | null = null;
let cachedHanjaMetadata: HanjaMetadata | null = null;

const HANJA_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function isHanjaChar(value: string) {
  return HANJA_CHAR.test(value);
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) {
    const normalized = value.trim();
    if (normalized && !target.includes(normalized)) target.push(normalized);
  }
}

function emptyHanjaCharacter(character: string): HanjaCharacter {
  return {
    character,
    meanings: [],
    hun: [],
    eum: [],
    sources: [],
  };
}

function hanjaCharsFromText(value: string | undefined) {
  return Array.from(String(value ?? "")).filter(isHanjaChar);
}

function parseHunGloss(gloss: string, reading: string) {
  return gloss
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split(/\s+/).filter(Boolean);
      if (pieces.at(-1) === reading && pieces.length > 1) return pieces.slice(0, -1).join(" ");
      if (part.endsWith(reading) && part.length > reading.length) return part.slice(0, -reading.length).trim();
      return part;
    })
    .filter(Boolean);
}

function splitUnihanDefinition(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(/;\s*|,\s*/)
    .map((meaning) => meaning.trim())
    .filter(Boolean);
}

function normalizeUnihanRecord(record: unknown) {
  if (typeof record === "string" || Array.isArray(record)) return splitUnihanDefinition(record);
  if (!record || typeof record !== "object") return [];
  const candidate = record as {
    definition?: string;
    kDefinition?: string;
    meanings?: string[];
  };
  return splitUnihanDefinition(candidate.meanings ?? candidate.definition ?? candidate.kDefinition);
}

async function optionalMtimeMs(filePath: string) {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return 0;
  }
}

function normalizeSearchText(value: string | undefined) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .trim();
}

function compactLatin(value: string | undefined) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, "");
}

function romanizeHangul(value: string | undefined) {
  let output = "";
  for (const char of String(value ?? "").normalize("NFC")) {
    const code = char.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) {
      if (/[a-z0-9]/i.test(char)) output += char.toLowerCase();
      continue;
    }

    const offset = code - 0xac00;
    const initialIndex = Math.floor(offset / 588);
    const medialIndex = Math.floor((offset % 588) / 28);
    const finalIndex = offset % 28;
    output += `${INITIALS[initialIndex]}${MEDIALS[medialIndex]}${FINALS[finalIndex]}`;
  }
  return output;
}

function loosenRomaja(value: string | undefined) {
  return compactLatin(value)
    .replace(/ng/g, "N")
    .replace(/eo/g, "o")
    .replace(/eu/g, "u")
    .replace(/ae/g, "e")
    .replace(/g/g, "k")
    .replace(/d/g, "t")
    .replace(/b/g, "p")
    .replace(/r/g, "l")
    .replace(/j/g, "ch")
    .replace(/N/g, "ng");
}

function entrySearchFields(entry: LexiconEntry) {
  const alternateFormText = (entry.alternateForms ?? [])
    .flatMap((form) => [form.form, form.reading, form.label])
    .filter(Boolean)
    .join(" ");
  const searchFormText = (entry.searchForms ?? [])
    .flatMap((form) => [form.form, form.reading, form.label])
    .filter(Boolean)
    .join(" ");
  const definitionText = entry.definitions
    .flatMap((definition) => [
      definition.text,
      definition.formOf?.form,
      definition.formOf?.reading,
      definition.formOf?.label,
      ...(definition.pos ?? []),
      ...(definition.tags ?? []),
      ...(definition.examples ?? []),
    ])
    .join(" ");
  const alternateHanja = (entry.alternateHanja ?? []).join(" ");
  const romajaValues = [
    romanizeHangul(entry.hangul),
    ...(entry.alternateForms ?? []).map((form) => romanizeHangul(form.reading)),
    ...(entry.searchForms ?? []).map((form) => romanizeHangul(form.reading)),
    ...entry.definitions.map((definition) => romanizeHangul(definition.formOf?.reading)),
  ].filter(Boolean);

  return {
    displayText: [entry.hangul, entry.hanja, alternateHanja, alternateFormText, searchFormText, definitionText].join(" "),
    romaja: romajaValues.join(" "),
    romajaLoose: romajaValues.map(loosenRomaja).join(" "),
  };
}

function createSearchIndex(lexicon: LexiconFile, mtimeMs: number): SearchIndex {
  return {
    metadata: lexicon.metadata,
    mtimeMs,
    entries: lexicon.entries.map((entry) => {
      const fields = entrySearchFields(entry);
      const exactKeyValues = [
        entry.hangul,
        entry.hanja,
        ...(entry.alternateHanja ?? []),
        ...(entry.alternateForms ?? []).flatMap((form) => [form.form, form.reading ?? ""]),
        ...(entry.searchForms ?? []).flatMap((form) => [form.form, form.reading ?? ""]),
        ...entry.definitions.flatMap((definition) => [definition.formOf?.form ?? "", definition.formOf?.reading ?? ""]),
      ];
      const exactKeys = new Set(exactKeyValues.map(normalizeSearchText).filter(Boolean));
      const prefixKeys = exactKeyValues.map(normalizeSearchText).filter(Boolean);
      return {
        ...entry,
        exactKeys,
        prefixKeys,
        haystack: normalizeSearchText(fields.displayText),
        romaja: compactLatin(fields.romaja),
        romajaLoose: loosenRomaja(fields.romajaLoose),
      };
    }),
  };
}

async function loadSearchIndex() {
  const filePath = path.join(process.cwd(), "app", "data", "generated", "lexicon.json");
  const fileStat = await stat(filePath);
  if (cachedSearchIndex && cachedSearchIndex.mtimeMs === fileStat.mtimeMs) return cachedSearchIndex;

  const raw = await readFile(filePath, "utf8");
  cachedSearchIndex = createSearchIndex(JSON.parse(raw) as LexiconFile, fileStat.mtimeMs);
  return cachedSearchIndex;
}

async function loadHanjaMetadata() {
  const hanjaPath = path.join(process.cwd(), "app", "data", "hanja.txt");
  const unihanPath = path.join(process.cwd(), "app", "data", "generated", "unihan-readings.json");
  const [hanjaMtimeMs, unihanMtimeMs] = await Promise.all([optionalMtimeMs(hanjaPath), optionalMtimeMs(unihanPath)]);
  const cacheKey = `${hanjaMtimeMs}:${unihanMtimeMs}`;
  if (cachedHanjaMetadata?.cacheKey === cacheKey) return cachedHanjaMetadata;

  const byChar = new Map<string, HanjaCharacter>();
  if (hanjaMtimeMs) {
    const raw = await readFile(hanjaPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const [readingRaw, formRaw, ...glossParts] = line.split(":");
      const reading = readingRaw?.trim();
      const form = formRaw?.trim();
      if (!reading || !form || Array.from(form).length !== 1 || !isHanjaChar(form)) continue;

      const record = byChar.get(form) ?? emptyHanjaCharacter(form);
      addUnique(record.eum, [reading]);
      addUnique(record.hun, parseHunGloss(glossParts.join(":").trim(), reading));
      addUnique(record.sources, ["hanja-table"]);
      byChar.set(form, record);
    }
  }

  if (unihanMtimeMs) {
    const raw = await readFile(unihanPath, "utf8");
    const records = JSON.parse(raw) as Record<string, unknown>;
    for (const [character, recordValue] of Object.entries(records)) {
      if (Array.from(character).length !== 1 || !isHanjaChar(character)) continue;
      const meanings = normalizeUnihanRecord(recordValue);
      if (!meanings.length) continue;
      const record = byChar.get(character) ?? emptyHanjaCharacter(character);
      addUnique(record.meanings, meanings);
      addUnique(record.sources, ["unihan"]);
      byChar.set(character, record);
    }
  }

  cachedHanjaMetadata = { byChar, cacheKey };
  return cachedHanjaMetadata;
}

function collectRelevantHanja(query: string, entries: LexiconEntry[]) {
  const characters: string[] = [];
  const append = (value: string | undefined) => addUnique(characters, hanjaCharsFromText(value));

  append(query);
  for (const entry of entries) {
    append(entry.hanja);
    for (const alternateHanja of entry.alternateHanja ?? []) append(alternateHanja);
    for (const form of entry.alternateForms ?? []) append(form.form);
    for (const form of entry.searchForms ?? []) append(form.form);
    for (const definition of entry.definitions ?? []) append(definition.formOf?.form);
  }

  return characters.slice(0, 32);
}

function buildHanjaCharacters(query: string, entries: LexiconEntry[], metadata: HanjaMetadata) {
  return collectRelevantHanja(query, entries).map((character) => metadata.byChar.get(character) ?? emptyHanjaCharacter(character));
}

function scoreEntry(entry: IndexedEntry, query: string, needle: string, latinNeedle: string, looseNeedle: string) {
  let score = 0;

  if (entry.exactKeys.has(query)) score += 1000;
  if (entry.romaja === latinNeedle || entry.romajaLoose === looseNeedle) score += 920;
  if (entry.prefixKeys.some((key) => key.startsWith(query))) score += 420;
  if (latinNeedle && entry.romaja.startsWith(latinNeedle)) score += 380;
  if (looseNeedle && entry.romajaLoose.startsWith(looseNeedle)) score += 360;
  if (entry.haystack.includes(needle)) score += 220;
  if (latinNeedle && entry.romaja.includes(latinNeedle)) score += 170;
  if (looseNeedle && entry.romajaLoose.includes(looseNeedle)) score += 150;

  return score > 0 ? score + (entry.confidence ?? 0) : 0;
}

function toPublicEntry(entry: IndexedEntry): LexiconEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { exactKeys, prefixKeys, haystack, romaja, romajaLoose, ...publicEntry } = entry;
  return publicEntry;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().normalize("NFC") ?? "";
  if (!query) return NextResponse.json({ metadata: {}, entries: [], hanjaCharacters: [] });

  const normalizedQuery = normalizeSearchText(query);
  const needle = normalizedQuery;
  const latinNeedle = compactLatin(query);
  const looseNeedle = loosenRomaja(query);

  try {
    const searchIndex = await loadSearchIndex();
    const entries = searchIndex.entries
      .map((entry) => ({
        entry,
        score: scoreEntry(entry, normalizedQuery, needle, latinNeedle, looseNeedle),
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        return (right.entry.confidence ?? 0) - (left.entry.confidence ?? 0);
      })
      .map((result) => toPublicEntry(result.entry))
      .slice(0, 100);
    const hanjaMetadata = await loadHanjaMetadata();
    const hanjaCharacters = buildHanjaCharacters(query, entries, hanjaMetadata);

    return NextResponse.json({ metadata: searchIndex.metadata ?? {}, entries, hanjaCharacters });
  } catch (error) {
    console.error("Failed to search generated lexicon:", error);
    return NextResponse.json(
      { error: "Generated lexicon is missing or invalid. Run npm run lexicon:build.", entries: [], hanjaCharacters: [] },
      { status: 500 },
    );
  }
}
