import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type LexiconDefinition = {
  text: string;
  pos: string[];
  examples: Array<string | SenseExample>;
  tags: string[];
  seeAlso?: Array<{
    form: string;
    reading?: string;
    label?: string;
  }>;
  formOf?: {
    form: string;
    reading?: string;
    label?: string;
  };
  sourceIds?: string[];
  confidence?: number;
};

type SenseExample = {
  korean: string;
  english?: string;
  mixedScript?: string;
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
  proficiency?: ProficiencyBadge[];
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

type InflectionForm = {
  label: string;
  description: string;
};

type InflectionAnalysis = {
  surface: string;
  lemma: string;
  forms: InflectionForm[];
};

type ProficiencyBadge = {
  system: "TOPIK";
  level: string;
  label: string;
};

type TopikRecord = {
  word: string;
  hanja?: string;
  topikLevel: string;
  label: string;
  source: string;
};

type TopikFile = {
  metadata?: Record<string, unknown>;
  entries: TopikRecord[];
};

type TopikIndex = {
  byWord: Map<string, TopikRecord[]>;
  mtimeMs: number;
};

type SentenceBankRecord = {
  id: string;
  korean: string;
  english?: string;
  source?: string;
  license?: string;
  terms: string[];
  definitionSourceIds?: string[];
};

type SentenceBankFile = {
  metadata?: Record<string, unknown>;
  entries: SentenceBankRecord[];
};

type SentenceBankIndex = {
  byTerm: Map<string, SentenceBankRecord[]>;
  byDefinitionSourceId: Map<string, SentenceBankRecord[]>;
  mtimeMs: number;
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
  byLookupKey: Map<string, IndexedEntry[]>;
  mtimeMs: number;
};

type SearchFilter =
  | { kind: "pos"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "topik"; value: string };

type ParsedSearchQuery = {
  raw: string;
  phrase: string;
  terms: string[];
  termGroups: string[][];
  filters: SearchFilter[];
  requireAllTerms: boolean;
};

type HanjaReplacement = {
  start: number;
  end: number;
  text: string;
  score: number;
  source: "exact" | "contextual-hada";
};

type HanjaMatchCandidate = {
  entry: IndexedEntry;
  mixed: string;
  score: number;
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
let cachedTopikIndex: TopikIndex | null = null;
let cachedSentenceBankIndex: SentenceBankIndex | null = null;

const HANJA_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const STRUCTURAL_HYPHENS = /[-‐‑‒–—―]/g;
const SYNONYM_OF_PATTERN = /^(?:\([^)]+\)\s*)?(?:North Korean\s+)?[Ss]ynonym of\s+(.+?)[.。]?$/;
const NORTH_KOREA_REDIRECT_PATTERN = /^North Korea standard (?:form|spelling) of\s+(.+?)(?:[.。]|$)/;
const REDIRECT_GLOSS_PATTERN = /^(?:\([^)]+\)\s*)?(?:North Korean\s+)?[Ss]ynonym of\s+|^Alternative form of\s+|^North Korea standard (?:form|spelling) of\s+/;
const INFLECTED_FORM_GLOSS_PATTERN = /\bform of\b|\b(?:indicative|interrogative|declarative|imperative|propositive|connective|adnominal|nominalized)\b.*\bform of\b/;
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const HANGUL_FINAL_COUNT = 28;
const FINAL_N = 4;
const FINAL_L = 8;
const FINAL_M = 16;
const FINAL_B = 17;
const FINAL_SS = 20;

function isHanjaChar(value: string) {
  return HANJA_CHAR.test(value);
}

function isHangulSyllable(value: string) {
  const code = value.charCodeAt(0);
  return code >= HANGUL_BASE && code <= HANGUL_LAST;
}

function hangulFinalIndex(value: string) {
  if (!isHangulSyllable(value)) return -1;
  return (value.charCodeAt(0) - HANGUL_BASE) % HANGUL_FINAL_COUNT;
}

function withoutFinalConsonant(value: string, finalIndex?: number) {
  const chars = Array.from(value);
  const last = chars.at(-1);
  if (!last) return "";
  const currentFinal = hangulFinalIndex(last);
  if (currentFinal <= 0 || (finalIndex !== undefined && currentFinal !== finalIndex)) return "";
  chars[chars.length - 1] = String.fromCharCode(last.charCodeAt(0) - currentFinal);
  return chars.join("");
}

function contractedLowStem(value: string) {
  const replacements: Array<[string, string]> = [
    ["봐", "보"],
    ["와", "오"],
    ["줘", "주"],
    ["돼", "되"],
    ["놔", "놓"],
  ];
  for (const [suffix, replacement] of replacements) {
    if (value.endsWith(suffix)) return `${value.slice(0, -suffix.length)}${replacement}`;
  }
  return "";
}

function cleanInflectionSurface(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/[.?!。！？…]+$/g, "")
    .trim();
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

function stripTrailingEumToken(value: string, reading: string) {
  if (value.endsWith(reading) && value.length > reading.length) return value.slice(0, -reading.length).trim();
  const match = value.match(/^(.+?)\s+([\uac00-\ud7a3]{1,2})$/);
  if (!match) return value;
  return match[1].trim();
}

function parseHunGloss(gloss: string, reading: string) {
  return gloss
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split(/\s+/).filter(Boolean);
      if (pieces.at(-1) === reading && pieces.length > 1) return pieces.slice(0, -1).join(" ");
      return stripTrailingEumToken(part, reading);
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

function normalizeUnihanMeanings(record: unknown) {
  if (typeof record === "string" || Array.isArray(record)) return splitUnihanDefinition(record);
  if (!record || typeof record !== "object") return [];
  const candidate = record as {
    definition?: string;
    kDefinition?: string;
    meanings?: string[];
  };
  return splitUnihanDefinition(candidate.meanings ?? candidate.definition ?? candidate.kDefinition);
}

function normalizeUnihanHangulReadings(record: unknown) {
  if (!record || typeof record !== "object") return [];
  const candidate = record as { kHangul?: string | string[] };
  const values = Array.isArray(candidate.kHangul) ? candidate.kHangul : String(candidate.kHangul ?? "").split(/\s+/);
  const readings: string[] = [];
  for (const value of values) {
    const reading = String(value).split(":")[0]?.normalize("NFC").trim();
    if (reading && !readings.includes(reading)) readings.push(reading);
  }
  return readings;
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

function normalizeStructuralSearchText(value: string | undefined) {
  return normalizeSearchText(value).replace(STRUCTURAL_HYPHENS, "");
}

function hasWildcard(value: string | undefined) {
  return /[*?]/.test(String(value ?? ""));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardRegExp(value: string | undefined) {
  const normalized = String(value ?? "");
  if (!hasWildcard(normalized)) return null;
  const pattern = Array.from(normalized)
    .map((char) => {
      if (char === "*") return ".*";
      if (char === "?") return ".";
      return escapeRegExp(char);
    })
    .join("");
  return new RegExp(`^${pattern}$`);
}

function searchKeyVariants(value: string | undefined) {
  const normalized = normalizeSearchText(value);
  const structural = normalizeStructuralSearchText(value);
  return [normalized, structural].filter((candidate, index, values) => candidate && values.indexOf(candidate) === index);
}

function compactLatin(value: string | undefined) {
  return normalizeSearchText(value).replace(/[^a-z0-9*?]/g, "");
}

function normalizeTopikWord(value: string | undefined) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\d+$/g, "");
}

function normalizeSentenceTerm(value: string | undefined) {
  return normalizeStructuralSearchText(value);
}

function hanjaOnly(value: string | undefined) {
  return hanjaCharsFromText(value).join("");
}

function topikLevelRank(level: string) {
  if (level === "A") return 1;
  if (level === "B") return 2;
  if (level === "C") return 3;
  return 99;
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
  const entries = lexicon.entries.map((entry) => {
    const fields = entrySearchFields(entry);
    const exactKeyValues = [
      entry.hangul,
      entry.hanja,
      ...(entry.alternateHanja ?? []),
      ...(entry.alternateForms ?? []).flatMap((form) => [form.form, form.reading ?? ""]),
      ...(entry.searchForms ?? []).flatMap((form) => [form.form, form.reading ?? ""]),
      ...entry.definitions.flatMap((definition) => [definition.formOf?.form ?? "", definition.formOf?.reading ?? ""]),
    ];
    const exactKeys = new Set(exactKeyValues.flatMap(searchKeyVariants));
    const prefixKeys = exactKeyValues.flatMap(searchKeyVariants);
    const haystack = [normalizeSearchText(fields.displayText), normalizeStructuralSearchText(fields.displayText)]
      .filter((candidate, index, values) => candidate && values.indexOf(candidate) === index)
      .join(" ");
    return {
      ...entry,
      exactKeys,
      prefixKeys,
      haystack,
      romaja: compactLatin(fields.romaja),
      romajaLoose: loosenRomaja(fields.romajaLoose),
    };
  });
  const byLookupKey = new Map<string, IndexedEntry[]>();
  const indexEntry = (key: string | undefined, entry: IndexedEntry) => {
    for (const normalized of searchKeyVariants(key)) {
      const matches = byLookupKey.get(normalized) ?? [];
      matches.push(entry);
      byLookupKey.set(normalized, matches);
    }
  };

  for (const entry of entries) {
    indexEntry(entry.hangul, entry);
    indexEntry(entry.hanja, entry);
    for (const alternateHanja of entry.alternateHanja ?? []) indexEntry(alternateHanja, entry);
    for (const alternate of entry.alternateForms ?? []) {
      indexEntry(alternate.form, entry);
      indexEntry(alternate.reading, entry);
    }
    for (const searchForm of entry.searchForms ?? []) {
      indexEntry(searchForm.form, entry);
      indexEntry(searchForm.reading, entry);
    }
    for (const definition of entry.definitions ?? []) {
      indexEntry(definition.formOf?.form, entry);
      indexEntry(definition.formOf?.reading, entry);
    }
  }

  return {
    metadata: lexicon.metadata,
    mtimeMs,
    entries,
    byLookupKey,
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
      const meanings = normalizeUnihanMeanings(recordValue);
      const hangulReadings = normalizeUnihanHangulReadings(recordValue);
      if (!meanings.length && !hangulReadings.length) continue;
      const record = byChar.get(character) ?? emptyHanjaCharacter(character);
      addUnique(record.meanings, meanings);
      if (hangulReadings.length) {
        record.eum = hangulReadings;
        addUnique(record.sources, ["unihan-khangul"]);
      }
      if (meanings.length) addUnique(record.sources, ["unihan"]);
      byChar.set(character, record);
    }
  }

  cachedHanjaMetadata = { byChar, cacheKey };
  return cachedHanjaMetadata;
}

async function loadTopikIndex() {
  const filePath = path.join(process.cwd(), "app", "data", "generated", "topik-levels.json");
  const mtimeMs = await optionalMtimeMs(filePath);
  if (!mtimeMs) return null;
  if (cachedTopikIndex?.mtimeMs === mtimeMs) return cachedTopikIndex;

  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw) as TopikFile;
  const byWord = new Map<string, TopikRecord[]>();

  for (const record of data.entries ?? []) {
    const word = normalizeTopikWord(record.word);
    if (!word || !record.topikLevel) continue;
    const records = byWord.get(word) ?? [];
    records.push({
      ...record,
      word,
      hanja: hanjaOnly(record.hanja),
    });
    byWord.set(word, records);
  }

  for (const records of Array.from(byWord.values())) {
    records.sort((left, right) => topikLevelRank(left.topikLevel) - topikLevelRank(right.topikLevel));
  }

  cachedTopikIndex = { byWord, mtimeMs };
  return cachedTopikIndex;
}

function topikCandidateWords(entry: LexiconEntry) {
  const candidates: string[] = [];
  addUnique(candidates, [
    normalizeTopikWord(entry.hangul),
    ...(entry.searchForms ?? []).map((form) => normalizeTopikWord(form.reading)),
    ...(entry.alternateForms ?? []).map((form) => normalizeTopikWord(form.reading)),
    ...entry.definitions.map((definition) => normalizeTopikWord(definition.formOf?.reading)),
  ]);
  return candidates;
}

function topikHanjaCompatible(record: TopikRecord, entry: LexiconEntry) {
  const recordHanja = hanjaOnly(record.hanja);
  if (!recordHanja) return true;
  const entryHanja = hanjaOnly(entry.hanja);
  if (!entryHanja) return true;
  if (entryHanja.includes(recordHanja) || recordHanja.includes(entryHanja)) return true;
  return (entry.searchForms ?? []).some((form) => hanjaOnly(form.form).includes(recordHanja));
}

function topikBadgeForEntry(entry: LexiconEntry, topikIndex: TopikIndex | null): ProficiencyBadge[] {
  if (!topikIndex) return [];

  const matches = topikCandidateWords(entry)
    .flatMap((word) => topikIndex.byWord.get(word) ?? [])
    .filter((record) => topikHanjaCompatible(record, entry))
    .sort((left, right) => topikLevelRank(left.topikLevel) - topikLevelRank(right.topikLevel));
  const best = matches[0];
  if (!best) return [];

  return [
    {
      system: "TOPIK",
      level: best.topikLevel,
      label: best.label,
    },
  ];
}

const POS_FILTER_ALIASES: Record<string, string[]> = {
  adj: ["adjective"],
  adjective: ["adjective"],
  adv: ["adverb"],
  adverb: ["adverb"],
  counter: ["counter"],
  det: ["determiner", "det"],
  determiner: ["determiner", "det"],
  expression: ["expression", "phrase"],
  noun: ["noun", "propernoun"],
  numeral: ["number", "numeral", "num"],
  number: ["number", "numeral", "num"],
  particle: ["particle"],
  phrase: ["phrase", "expression"],
  prefix: ["prefix"],
  pron: ["pronoun", "pron"],
  pronoun: ["pronoun", "pron"],
  propernoun: ["propernoun"],
  root: ["root"],
  suffix: ["suffix"],
  verb: ["verb"],
};

const KOREAN_PARTICLES = [
  "으로부터",
  "에게서",
  "한테서",
  "으로서",
  "으로써",
  "이라도",
  "이나마",
  "에서",
  "에게",
  "한테",
  "께서",
  "부터",
  "까지",
  "보다",
  "처럼",
  "만큼",
  "조차",
  "마저",
  "밖에",
  "하고",
  "이랑",
  "라도",
  "이나",
  "으로",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "로",
  "와",
  "과",
  "랑",
  "도",
  "만",
  "나",
  "야",
  "여",
].sort((left, right) => right.length - left.length);

const PARTICLE_SET = new Set(KOREAN_PARTICLES);

function normalizeFacet(value: string | undefined) {
  return normalizeSearchText(value).replace(/[\s_-]+/g, "");
}

function parseHashFilter(token: string): SearchFilter | null {
  const raw = token.replace(/^#+/, "").trim();
  if (!raw) return null;
  const normalized = normalizeFacet(raw);
  if (!normalized) return null;
  if (normalized.startsWith("topik")) return { kind: "topik", value: normalized.slice("topik".length) || "any" };
  if (POS_FILTER_ALIASES[normalized]) return { kind: "pos", value: normalized };
  return { kind: "tag", value: raw };
}

function isDenseHangulTerm(value: string) {
  return /^[\uac00-\ud7a3]+$/.test(value);
}

function hasLatinToken(value: string) {
  return /[a-z]/i.test(value);
}

function addSearchExpansion(expansions: string[], value: string | undefined) {
  const normalized = String(value ?? "").normalize("NFC").trim();
  if (normalized && !expansions.includes(normalized)) expansions.push(normalized);
}

function indexHasLookup(searchIndex: SearchIndex, value: string) {
  return searchKeyVariants(value).some((key) => searchIndex.byLookupKey.has(key));
}

function segmentHangulTerm(term: string, searchIndex: SearchIndex) {
  const output: string[] = [];
  const queue: Array<{ index: number; parts: string[] }> = [{ index: 0, parts: [] }];
  const seen = new Set<string>();

  while (queue.length && output.length < 40) {
    const current = queue.shift() as { index: number; parts: string[] };
    if (current.index === term.length) {
      if (current.parts.length > 1 && current.parts.some((part) => part.length > 1)) {
        for (const part of current.parts) addSearchExpansion(output, part);
      }
      continue;
    }

    for (let end = term.length; end > current.index; end -= 1) {
      const part = term.slice(current.index, end);
      const isParticle = PARTICLE_SET.has(part);
      if (!isParticle && !indexHasLookup(searchIndex, part)) continue;
      if (part.length === 1 && !isParticle && current.parts.length > 1) continue;
      const next = { index: end, parts: [...current.parts, part] };
      const key = `${next.index}:${next.parts.join("|")}`;
      if (seen.has(key) || next.parts.length > 5) continue;
      seen.add(key);
      queue.push(next);
    }
  }

  return output;
}

function searchTermExpansions(term: string, searchIndex: SearchIndex) {
  const expansions: string[] = [];
  addSearchExpansion(expansions, term);

  const normalized = term.normalize("NFC").trim();
  if (isDenseHangulTerm(normalized) && Array.from(normalized).length >= 2) {
    if (indexHasLookup(searchIndex, normalized)) return expansions;

    for (const particle of KOREAN_PARTICLES) {
      if (!normalized.endsWith(particle) || normalized.length <= particle.length) continue;
      const stem = normalized.slice(0, -particle.length);
      if (stem.length >= 2 || indexHasLookup(searchIndex, stem)) {
        addSearchExpansion(expansions, stem);
        addSearchExpansion(expansions, particle);
      }
    }
    for (const segment of segmentHangulTerm(normalized, searchIndex)) addSearchExpansion(expansions, segment);
  }

  return expansions;
}

function parseSearchQuery(raw: string, searchIndex: SearchIndex): ParsedSearchQuery {
  const tokens = raw.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  const filters: SearchFilter[] = [];
  const termTokens: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("#")) {
      const filter = parseHashFilter(token);
      if (filter) filters.push(filter);
    } else {
      termTokens.push(token);
    }
  }

  const phrase = termTokens.join(" ");
  const termGroups = termTokens.map((term) => searchTermExpansions(term, searchIndex)).filter((group) => group.length > 0);

  return {
    raw,
    phrase,
    terms: termTokens,
    termGroups,
    filters,
    requireAllTerms: termTokens.length > 1 && termTokens.some(hasLatinToken),
  };
}

function normalizedTopikFilterLevels(value: string) {
  const normalized = normalizeFacet(value).replace(/^level/, "");
  if (!normalized || normalized === "any") return ["a", "b", "c", "1", "2", "3", "4", "5", "6"];
  if (normalized === "a" || normalized === "beginner" || normalized === "beginning") return ["a", "1", "2"];
  if (normalized === "b" || normalized === "intermediate") return ["b", "3", "4"];
  if (normalized === "c" || normalized === "advanced") return ["c", "5", "6"];
  if (normalized === "1" || normalized === "2") return [normalized, "a"];
  if (normalized === "3" || normalized === "4") return [normalized, "b"];
  if (normalized === "5" || normalized === "6") return [normalized, "c"];
  return [normalized];
}

function entryMatchesPosFilter(entry: LexiconEntry, value: string) {
  const accepted = new Set(POS_FILTER_ALIASES[normalizeFacet(value)] ?? [normalizeFacet(value)]);
  return entry.definitions.some((definition) =>
    (definition.pos ?? []).some((pos) => accepted.has(normalizeFacet(pos))),
  );
}

function entryMatchesTagFilter(entry: LexiconEntry, value: string) {
  const wanted = normalizeFacet(value);
  const tags = [
    ...entry.definitions.flatMap((definition) => definition.tags ?? []),
    ...(entry.alternateForms ?? []).map((form) => form.label ?? ""),
    ...(entry.searchForms ?? []).map((form) => form.label ?? ""),
  ];
  return tags.some((tag) => {
      const normalizedTag = normalizeFacet(tag);
      return normalizedTag === wanted || normalizedTag.includes(wanted);
  });
}

function entryMatchesTopikFilter(entry: LexiconEntry, value: string, topikIndex: TopikIndex | null) {
  const wanted = new Set(normalizedTopikFilterLevels(value));
  return topikBadgeForEntry(entry, topikIndex).some((badge) => {
    const level = normalizeFacet(badge.level);
    const label = normalizeFacet(badge.label).replace(/^topik/, "");
    return wanted.has(level) || wanted.has(label);
  });
}

function entryMatchesFilters(entry: LexiconEntry, filters: SearchFilter[], topikIndex: TopikIndex | null) {
  return filters.every((filter) => {
    if (filter.kind === "pos") return entryMatchesPosFilter(entry, filter.value);
    if (filter.kind === "topik") return entryMatchesTopikFilter(entry, filter.value, topikIndex);
    return entryMatchesTagFilter(entry, filter.value);
  });
}

async function loadSentenceBankIndex() {
  const filePath = path.join(process.cwd(), "app", "data", "generated", "sentence-bank.json");
  const mtimeMs = await optionalMtimeMs(filePath);
  if (!mtimeMs) return null;
  if (cachedSentenceBankIndex?.mtimeMs === mtimeMs) return cachedSentenceBankIndex;

  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw) as SentenceBankFile;
  const byTerm = new Map<string, SentenceBankRecord[]>();
  const byDefinitionSourceId = new Map<string, SentenceBankRecord[]>();

  for (const record of data.entries ?? []) {
    const normalizedRecord: SentenceBankRecord = {
      ...record,
      korean: String(record.korean ?? "").normalize("NFC").trim(),
      english: String(record.english ?? "").normalize("NFC").trim() || undefined,
      terms: (record.terms ?? []).map(normalizeSentenceTerm).filter(Boolean),
      definitionSourceIds: (record.definitionSourceIds ?? []).map((id) => String(id).trim()).filter(Boolean),
    };
    if (!normalizedRecord.korean) continue;

    for (const term of normalizedRecord.terms) {
      const records = byTerm.get(term) ?? [];
      records.push(normalizedRecord);
      byTerm.set(term, records);
    }
    for (const sourceId of normalizedRecord.definitionSourceIds ?? []) {
      const records = byDefinitionSourceId.get(sourceId) ?? [];
      records.push(normalizedRecord);
      byDefinitionSourceId.set(sourceId, records);
    }
  }

  cachedSentenceBankIndex = { byTerm, byDefinitionSourceId, mtimeMs };
  return cachedSentenceBankIndex;
}

function parseStoredExample(value: string | SenseExample): SenseExample | null {
  if (typeof value !== "string") {
    const korean = String(value.korean ?? "").normalize("NFC").trim();
    if (!korean) return null;
    return {
      korean,
      english: String(value.english ?? "").normalize("NFC").trim() || undefined,
    };
  }

  const text = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const parts = text.split(/\s+―\s+|\s+—\s+|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1 && /[\uac00-\ud7a3][.!?。！？]\s+[A-Za-z]/.test(text)) {
    const sentenceParts = text.split(/(?<=[.!?。！？])\s+(?=[A-Za-z])/).map((part) => part.trim()).filter(Boolean);
    return {
      korean: sentenceParts[0],
      english: sentenceParts.length > 1 ? sentenceParts.at(-1) : undefined,
    };
  }

  const korean = parts.find((part) => /[\uac00-\ud7a3]/.test(part)) ?? text;
  const english = Array.from(parts)
    .reverse()
    .find((part) => /[A-Za-z]/.test(part) && !/[\uac00-\ud7a3]/.test(part));
  return {
    korean,
    english,
  };
}

function isFormulaLikeExample(value: string) {
  return /[+＋→=]|(?:^|\s)-?>|①|②|③|④|⑤|⑥|⑦|⑧|⑨/.test(value);
}

function looksRomanizedKorean(value: string) {
  return /(?:^|[-\s'])(?:eun|neun|reul|eul|ui|ida|hada|hae|eseo|euro|ro|geos|tteus|imnida|mnida|seumnida|hamnida|rago|iradeun|gateun)(?:$|[-\s'])/i.test(value);
}

function looksTranslatedEnglish(value: string) {
  const text = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!/[A-Za-z]/.test(text) || /[\uac00-\ud7a3]/.test(text) || looksRomanizedKorean(text)) return false;
  if (/^(?:ok|yes|no|hello|thanks?|thank you)[.!?]?$/i.test(text)) return true;
  return /\b(?:the|a|an|of|to|in|on|for|with|and|or|is|are|was|were|be|been|being|will|would|can|could|should|may|might|must|do|does|did|have|has|had|i|you|he|she|it|we|they|this|that|these|those|my|your|his|her|their|our)\b/i.test(text);
}

function isUsableSenseExample(example: SenseExample | null): example is SenseExample {
  if (!example?.korean) return false;
  const korean = example.korean.normalize("NFC").trim();
  const english = example.english?.normalize("NFC").trim() ?? "";
  if (!looksTranslatedEnglish(english)) return false;
  if (isFormulaLikeExample(korean) || isFormulaLikeExample(english)) return false;
  const hangulCount = (korean.match(/[\uac00-\ud7a3]/g) ?? []).length;
  return hangulCount >= 3 && /[.!?。！？]$/.test(korean);
}

function hasHanja(value: string | undefined) {
  return hanjaCharsFromText(value).length > 0;
}

function englishClueTokens(...values: Array<string | undefined>) {
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "another",
    "because",
    "been",
    "being",
    "could",
    "does",
    "from",
    "have",
    "into",
    "more",
    "other",
    "over",
    "such",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "this",
    "those",
    "through",
    "under",
    "were",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would",
  ]);
  return new Set(
    values
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3 && !stopWords.has(token)),
  );
}

function overlapCount(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of Array.from(left)) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function definitionClueText(entry: LexiconEntry) {
  return (entry.definitions ?? [])
    .flatMap((definition) => [definition.text, ...(definition.pos ?? []), ...(definition.tags ?? [])])
    .join(" ");
}

function mixedFormCandidatesForReading(entry: LexiconEntry, reading: string) {
  const normalizedReading = normalizeStructuralSearchText(reading);
  const values: Array<{ reading?: string; mixed?: string }> = [
    { reading: entry.hangul, mixed: entry.hanja },
    ...(entry.alternateForms ?? []).map((form) => ({ reading: form.reading, mixed: form.form })),
    ...(entry.searchForms ?? []).map((form) => ({ reading: form.reading, mixed: form.form })),
    ...(entry.definitions ?? []).map((definition) => ({ reading: definition.formOf?.reading, mixed: definition.formOf?.form })),
  ];

  const mixedForms: string[] = [];
  for (const value of values) {
    const mixed = String(value.mixed ?? "").normalize("NFC").trim();
    if (!mixed || !hasHanja(mixed)) continue;
    if (normalizeStructuralSearchText(value.reading) !== normalizedReading) continue;
    if (mixed === value.reading) continue;
    addUnique(mixedForms, [mixed]);
  }
  return mixedForms;
}

function isContextEntry(entry: LexiconEntry, contextEntry: LexiconEntry) {
  if (entry.id === contextEntry.id) return true;
  return normalizeStructuralSearchText(entry.hangul) === normalizeStructuralSearchText(contextEntry.hangul)
    && hanjaOnly(entry.hanja) === hanjaOnly(contextEntry.hanja);
}

function scoreHanjaCandidate(
  entry: IndexedEntry,
  mixed: string,
  example: SenseExample,
  contextEntry: LexiconEntry,
  contextDefinition: LexiconDefinition,
) {
  let score = 0;
  if (isContextEntry(entry, contextEntry)) score += 500;

  const contextSourceIds = new Set(contextDefinition.sourceIds ?? []);
  if (entry.definitions.some((definition) => (definition.sourceIds ?? []).some((sourceId) => contextSourceIds.has(sourceId)))) {
    score += 260;
  }

  const contextHanja = hanjaOnly(contextEntry.hanja);
  const mixedHanja = hanjaOnly(mixed);
  if (contextHanja && mixedHanja && (contextHanja.includes(mixedHanja) || mixedHanja.includes(contextHanja))) score += 120;

  const exampleTokens = englishClueTokens(example.english, contextDefinition.text);
  const candidateTokens = englishClueTokens(definitionClueText(entry));
  score += Math.min(160, overlapCount(exampleTokens, candidateTokens) * 32);
  score += Math.min(40, Math.floor((entry.confidence ?? 0) / 5));
  return score;
}

function bestHanjaCandidateForReading(
  reading: string,
  example: SenseExample,
  contextEntry: LexiconEntry,
  contextDefinition: LexiconDefinition,
  searchIndex: SearchIndex,
) {
  const entries = searchIndex.byLookupKey.get(normalizeStructuralSearchText(reading)) ?? [];
  const candidates: HanjaMatchCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const mixed of mixedFormCandidatesForReading(entry, reading)) {
      const key = `${entry.id}\u0000${mixed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        entry,
        mixed,
        score: scoreHanjaCandidate(entry, mixed, example, contextEntry, contextDefinition),
      });
    }
  }
  candidates.sort((left, right) => right.score - left.score || (right.entry.confidence ?? 0) - (left.entry.confidence ?? 0));

  const best = candidates[0];
  if (!best) return null;
  const runnerUp = candidates[1];
  const isContextual = isContextEntry(best.entry, contextEntry);
  if (!runnerUp) return best;
  if (isContextual && best.score >= runnerUp.score) return best;
  if (best.score >= runnerUp.score + 64) return best;
  return null;
}

function isHangulAt(value: string, index: number) {
  return isHangulSyllable(value[index] ?? "");
}

function exactHanjaReplacements(
  example: SenseExample,
  contextEntry: LexiconEntry,
  contextDefinition: LexiconDefinition,
  searchIndex: SearchIndex,
) {
  const replacements: HanjaReplacement[] = [];
  const text = example.korean;
  const maxSpanLength = 14;
  let index = 0;
  while (index < text.length) {
    if (!isHangulAt(text, index)) {
      index += 1;
      continue;
    }

    let end = index;
    while (end < text.length && isHangulAt(text, end)) end += 1;
    const maxEnd = Math.min(end, index + maxSpanLength);
    for (let spanEnd = index + 2; spanEnd <= maxEnd; spanEnd += 1) {
      const reading = text.slice(index, spanEnd);
      const best = bestHanjaCandidateForReading(reading, example, contextEntry, contextDefinition, searchIndex);
      if (!best || best.mixed === reading) continue;
      replacements.push({
        start: index,
        end: spanEnd,
        text: best.mixed,
        score: best.score + reading.length,
        source: "exact",
      });
    }
    index = end;
  }
  return replacements;
}

function contextualHadaReplacementFromForm(
  example: SenseExample,
  contextEntry: LexiconEntry,
  contextDefinition: LexiconDefinition,
  reading: string | undefined,
  mixed: string | undefined,
): HanjaReplacement | null {
  const normalizedReading = String(reading ?? "").normalize("NFC").trim();
  const normalizedMixed = String(mixed ?? "").normalize("NFC").trim();
  if (!normalizedReading.endsWith("하다") || !normalizedMixed.endsWith("하다") || !hasHanja(normalizedMixed)) return null;

  const readingStem = normalizedReading.slice(0, -"하다".length);
  const mixedStem = normalizedMixed.slice(0, -"하다".length);
  if (!readingStem || !mixedStem || !hasHanja(mixedStem)) return null;

  const start = example.korean.indexOf(readingStem);
  if (start < 0) return null;
  const suffix = example.korean.slice(start + readingStem.length, start + readingStem.length + 1);
  if (!/[하해했한할함합합했하시셨]/.test(suffix)) return null;

  return {
    start,
    end: start + readingStem.length,
    text: mixedStem,
    score: 900 + scoreHanjaCandidate(contextEntry as IndexedEntry, normalizedMixed, example, contextEntry, contextDefinition),
    source: "contextual-hada",
  };
}

function contextualHadaReplacements(
  example: SenseExample,
  contextEntry: LexiconEntry,
  contextDefinition: LexiconDefinition,
) {
  return [
    contextualHadaReplacementFromForm(example, contextEntry, contextDefinition, contextEntry.hangul, contextEntry.hanja),
    contextualHadaReplacementFromForm(example, contextEntry, contextDefinition, contextDefinition.formOf?.reading, contextDefinition.formOf?.form),
  ].filter((replacement): replacement is HanjaReplacement => Boolean(replacement));
}

function applyHanjaReplacements(text: string, replacements: HanjaReplacement[]) {
  const accepted: HanjaReplacement[] = [];
  for (const replacement of replacements.sort((left, right) => {
    const leftLength = left.end - left.start;
    const rightLength = right.end - right.start;
    return right.score - left.score || rightLength - leftLength || left.start - right.start;
  })) {
    if (accepted.some((existing) => replacement.start < existing.end && replacement.end > existing.start)) continue;
    accepted.push(replacement);
  }

  accepted.sort((left, right) => left.start - right.start);
  let output = "";
  let cursor = 0;
  for (const replacement of accepted) {
    output += `${text.slice(cursor, replacement.start)}${replacement.text}`;
    cursor = replacement.end;
  }
  output += text.slice(cursor);
  return output;
}

function mixedScriptExample(
  example: SenseExample,
  contextEntry: LexiconEntry,
  contextDefinition: LexiconDefinition,
  searchIndex: SearchIndex,
): SenseExample {
  const replacements = exactHanjaReplacements(example, contextEntry, contextDefinition, searchIndex);
  replacements.push(...contextualHadaReplacements(example, contextEntry, contextDefinition));

  const mixedScript = applyHanjaReplacements(example.korean, replacements);
  if (mixedScript === example.korean || !hasHanja(mixedScript)) return example;
  return {
    ...example,
    mixedScript,
  };
}

function exampleFromSentenceRecord(record: SentenceBankRecord): SenseExample {
  return {
    korean: record.korean,
    english: record.english,
  };
}

function entryDefinitionTerms(entry: LexiconEntry, definition: LexiconDefinition) {
  const values = [
    entry.hangul,
    entry.hanja,
    ...(entry.alternateHanja ?? []),
    ...(entry.alternateForms ?? []).flatMap((form) => [form.form, form.reading ?? ""]),
    ...(entry.searchForms ?? []).flatMap((form) => [form.form, form.reading ?? ""]),
    definition.formOf?.form ?? "",
    definition.formOf?.reading ?? "",
  ];
  return values.flatMap(searchKeyVariants).map(normalizeSentenceTerm).filter(Boolean);
}

function shouldUseTermMatchedRecord(record: SentenceBankRecord) {
  if ((record.definitionSourceIds ?? []).length > 0) return false;
  return record.source !== "lexicon-example";
}

function sentenceRecordHanjaTerms(record: SentenceBankRecord) {
  return (record.terms ?? []).map(hanjaOnly).filter(Boolean);
}

function entryHanjaForms(entry: LexiconEntry) {
  return [
    entry.hanja,
    ...(entry.alternateHanja ?? []),
    ...(entry.alternateForms ?? []).map((form) => form.form),
    ...(entry.searchForms ?? []).map((form) => form.form),
    ...entry.definitions.map((definition) => definition.formOf?.form ?? ""),
  ].map(hanjaOnly).filter(Boolean);
}

function sentenceRecordHanjaCompatible(record: SentenceBankRecord, entry: LexiconEntry) {
  const recordHanja = sentenceRecordHanjaTerms(record);
  if (!recordHanja.length) return true;
  const entryHanja = entryHanjaForms(entry);
  return recordHanja.some((recordForm) =>
    entryHanja.some((entryForm) => entryForm.includes(recordForm) || recordForm.includes(entryForm)),
  );
}

function scoreSentenceRecord(record: SentenceBankRecord, entry: LexiconEntry, definition: LexiconDefinition) {
  if (!sentenceRecordHanjaCompatible(record, entry)) return 0;

  let score = 0;
  const sourceIds = new Set(definition.sourceIds ?? []);
  if ((record.definitionSourceIds ?? []).some((sourceId) => sourceIds.has(sourceId))) score += 1000;
  const formReading = definition.formOf?.reading ?? "";
  if ((formReading && record.korean.includes(formReading)) || (entry.hangul && record.korean.includes(entry.hangul))) score += 80;
  if (entry.hanja !== entry.hangul && record.korean.includes(entry.hanja)) score += 60;
  const glossTokens = normalizeSearchText(definition.text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
  const english = normalizeSearchText(record.english);
  score += Math.min(60, glossTokens.filter((token) => english.includes(token)).length * 12);
  return score;
}

function sentenceExamplesForDefinition(
  entry: LexiconEntry,
  definition: LexiconDefinition,
  sentenceBank: SentenceBankIndex | null,
  searchIndex: SearchIndex,
) {
  const candidates: SentenceBankRecord[] = [];
  const seenRecordIds = new Set<string>();
  const addRecords = (records: SentenceBankRecord[], term?: string) => {
    for (const record of records) {
      if (term && !shouldUseTermMatchedRecord(record)) continue;
      if (seenRecordIds.has(record.id)) continue;
      seenRecordIds.add(record.id);
      candidates.push(record);
    }
  };

  if (sentenceBank) {
    for (const sourceId of definition.sourceIds ?? []) addRecords(sentenceBank.byDefinitionSourceId.get(sourceId) ?? []);
    for (const term of entryDefinitionTerms(entry, definition)) addRecords(sentenceBank.byTerm.get(term) ?? [], term);
  }

  const examples: SenseExample[] = [];
  const seenExamples = new Set<string>();
  const addExample = (example: SenseExample | null) => {
    if (!isUsableSenseExample(example)) return;
    const key = `${example.korean}\n${example.english ?? ""}`;
    if (seenExamples.has(key)) return;
    seenExamples.add(key);
    examples.push(example);
  };

  for (const example of definition.examples ?? []) addExample(parseStoredExample(example));
  for (const record of candidates
    .map((record) => ({ record, score: scoreSentenceRecord(record, entry, definition) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)) {
    addExample(exampleFromSentenceRecord(record.record));
  }

  return examples.slice(0, 2).map((example) => mixedScriptExample(example, entry, definition, searchIndex));
}

function attachSentenceExamples(entry: LexiconEntry, sentenceBank: SentenceBankIndex | null, searchIndex: SearchIndex): LexiconEntry {
  return {
    ...entry,
    definitions: entry.definitions.map((definition) => ({
      ...definition,
      examples: sentenceExamplesForDefinition(entry, definition, sentenceBank, searchIndex),
    })),
  };
}

function parseSynonymTarget(text: string) {
  const synonymMatch = text.match(SYNONYM_OF_PATTERN);
  if (!synonymMatch) return null;

  const body = synonymMatch[1].trim();
  const fallbackGloss = body.match(/[“"]([^”"]+)[”"]/)?.[1]?.trim();
  const firstTarget = body.split(",")[0].trim();
  const targetSegment = firstTarget.replace(/\s+\(.+$/, "").trim();
  const hanjaAnnotated = targetSegment.match(/^(.+?)\(([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+)\)$/);

  return {
    form: (hanjaAnnotated?.[1] ?? targetSegment).trim(),
    hanja: hanjaAnnotated?.[2]?.trim() ?? "",
    fallbackGloss,
  };
}

function isRedirectGloss(text: string | undefined) {
  return REDIRECT_GLOSS_PATTERN.test(String(text ?? ""));
}

function targetEntriesForSynonym(definition: LexiconDefinition, lookup: Map<string, IndexedEntry[]>) {
  const target = parseSynonymTarget(definition.text);
  if (!target?.form) return [];

  const candidates = [
    ...(lookup.get(normalizeSearchText(target.form)) ?? []),
    ...(lookup.get(normalizeSearchText(target.hanja)) ?? []),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((left, right) => {
      if (target.hanja) {
        const leftMatches = left.hanja === target.hanja || left.alternateHanja?.includes(target.hanja);
        const rightMatches = right.hanja === target.hanja || right.alternateHanja?.includes(target.hanja);
        if (leftMatches !== rightMatches) return leftMatches ? -1 : 1;
      }
      const leftPosMatch = left.definitions.some((item) => item.pos?.some((pos) => definition.pos?.includes(pos)));
      const rightPosMatch = right.definitions.some((item) => item.pos?.some((pos) => definition.pos?.includes(pos)));
      if (leftPosMatch !== rightPosMatch) return leftPosMatch ? -1 : 1;
      return (right.confidence ?? 0) - (left.confidence ?? 0);
    });
}

function synonymSeeAlsoForm(targetEntry: IndexedEntry, parsed: NonNullable<ReturnType<typeof parseSynonymTarget>>) {
  const form = targetEntry.hanja && targetEntry.hanja !== targetEntry.hangul ? targetEntry.hanja : targetEntry.hangul;
  return {
    form: form || parsed.form,
    reading: targetEntry.hangul && targetEntry.hangul !== form ? targetEntry.hangul : undefined,
    label: "see-also",
  };
}

function resolveSynonymDefinition(definition: LexiconDefinition, lookup: Map<string, IndexedEntry[]>): LexiconDefinition {
  const parsed = parseSynonymTarget(definition.text);
  if (!parsed) return definition;

  const targetEntry = targetEntriesForSynonym(definition, lookup)[0];
  const replacement = targetEntry?.definitions.find((candidate) => !isRedirectGloss(candidate.text));
  if (!replacement && !parsed.fallbackGloss) return definition;

  return {
    ...definition,
    text: replacement?.text ?? parsed.fallbackGloss ?? definition.text,
    pos: replacement?.pos?.length ? replacement.pos : definition.pos,
    examples: replacement?.examples?.length ? replacement.examples : definition.examples,
    seeAlso: targetEntry ? [synonymSeeAlsoForm(targetEntry, parsed)] : [{ form: parsed.form, label: "see-also" }],
  };
}

function resolveSynonymDefinitions(entry: LexiconEntry, lookup: Map<string, IndexedEntry[]>): LexiconEntry {
  const definitions = entry.definitions.map((definition) => resolveSynonymDefinition(definition, lookup));
  if (definitions.every((definition, index) => definition === entry.definitions[index])) return entry;
  return {
    ...entry,
    definitions,
  };
}

function productiveFormKey(form: NonNullable<LexiconDefinition["formOf"]>) {
  return `${form.form}\u0000${form.reading ?? ""}`;
}

function promoteSharedHadaFormEntry(entry: LexiconEntry): LexiconEntry {
  if (!entry.definitions.length) return entry;

  const forms = entry.definitions.map((definition) => definition.formOf).filter((form): form is NonNullable<LexiconDefinition["formOf"]> => Boolean(form));
  if (forms.length !== entry.definitions.length) return entry;
  if (new Set(forms.map(productiveFormKey)).size !== 1) return entry;

  const form = forms[0];
  if (!form.form.endsWith("하다") || !form.reading?.endsWith("하다")) return entry;
  if (form.form === entry.hanja && form.reading === entry.hangul) return entry;

  return {
    ...entry,
    hanja: form.form,
    hangul: form.reading,
    definitions: entry.definitions.map((definition) => ({
      ...definition,
      formOf: undefined,
    })),
  };
}

function definitionDedupeKey(definition: LexiconDefinition) {
  return [
    normalizeSearchText(definition.text),
    definition.pos.join("|"),
    definition.tags.join("|"),
    definition.formOf ? productiveFormKey(definition.formOf) : "",
  ].join("\u0000");
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values));
}

function dedupePublicDefinitions(entry: LexiconEntry): LexiconEntry {
  const byKey = new Map<string, LexiconDefinition>();
  const definitions: LexiconDefinition[] = [];

  for (const definition of entry.definitions) {
    const key = definitionDedupeKey(definition);
    const existing = byKey.get(key);
    if (!existing) {
      const copy = { ...definition };
      byKey.set(key, copy);
      definitions.push(copy);
      continue;
    }

    existing.examples = uniqueValues([...(existing.examples ?? []), ...(definition.examples ?? [])]);
    existing.sourceIds = uniqueValues([...(existing.sourceIds ?? []), ...(definition.sourceIds ?? [])]);
    existing.seeAlso = mergePublicAlternateForms(existing.seeAlso, definition.seeAlso);
    existing.confidence = Math.max(existing.confidence ?? 0, definition.confidence ?? 0) || undefined;
  }

  if (definitions.length === entry.definitions.length) return entry;
  return {
    ...entry,
    definitions,
  };
}

function parseNorthKoreanRedirectTarget(text: string | undefined) {
  const match = String(text ?? "").match(NORTH_KOREA_REDIRECT_PATTERN);
  if (!match) return null;

  const targetSegment = match[1].replace(/\s+\(.+$/, "").trim();
  const hanjaAnnotated = targetSegment.match(/^(.+?)\s*\(([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+)\)$/);
  return {
    form: (hanjaAnnotated?.[1] ?? targetSegment).trim(),
    hanja: hanjaAnnotated?.[2]?.trim() ?? "",
  };
}

function northKoreanRedirectTarget(entry: LexiconEntry) {
  for (const definition of entry.definitions ?? []) {
    const target = parseNorthKoreanRedirectTarget(definition.text);
    if (target?.form) return target;
  }
  return null;
}

function isNorthKoreanRedirectDefinition(definition: LexiconDefinition) {
  return NORTH_KOREA_REDIRECT_PATTERN.test(definition.text);
}

function mergePublicAlternateForms(
  existingForms: NonNullable<LexiconEntry["alternateForms"]> = [],
  additions: NonNullable<LexiconEntry["alternateForms"]> = [],
) {
  const byKey = new Map<string, NonNullable<LexiconEntry["alternateForms"]>[number]>();
  for (const form of [...existingForms, ...additions]) {
    const key = `${form.form}\u0000${form.reading ?? ""}\u0000${form.label ?? ""}`;
    byKey.set(key, form);
  }
  return Array.from(byKey.values());
}

function northKoreanTargetCandidates(
  target: NonNullable<ReturnType<typeof parseNorthKoreanRedirectTarget>>,
  lookup: Map<string, IndexedEntry[]>,
) {
  const candidates = [
    ...(lookup.get(normalizeSearchText(target.form)) ?? []),
    ...(lookup.get(normalizeSearchText(target.hanja)) ?? []),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      if (target.hanja && candidate.hanja !== target.hanja && !candidate.alternateHanja?.includes(target.hanja)) return false;
      return candidate.hangul === target.form || candidate.exactKeys.has(normalizeSearchText(target.form));
    })
    .sort((left, right) => {
      const leftRedirect = left.definitions.every(isNorthKoreanRedirectDefinition);
      const rightRedirect = right.definitions.every(isNorthKoreanRedirectDefinition);
      if (leftRedirect !== rightRedirect) return leftRedirect ? 1 : -1;
      return (right.confidence ?? 0) - (left.confidence ?? 0);
    });
}

function mergeNorthKoreanRedirectEntries(entries: LexiconEntry[], lookup: Map<string, IndexedEntry[]>): LexiconEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const order = entries.map((entry) => entry.id);
  const removed = new Set<string>();

  for (const entry of entries) {
    const target = northKoreanRedirectTarget(entry);
    if (!target || target.form === entry.hangul) continue;

    const targetEntry = northKoreanTargetCandidates(target, lookup).find((candidate) => candidate.id !== entry.id);
    if (!targetEntry) continue;

    const currentTarget = byId.get(targetEntry.id) ?? toPublicEntry(targetEntry);
    const alternate = {
      form: entry.hanja && entry.hanja !== entry.hangul ? entry.hanja : entry.hangul,
      reading: entry.hangul,
      label: "North Korea, Yanbian, or archaic",
    };
    const transferableDefinitions = entry.definitions.filter((definition) => !isNorthKoreanRedirectDefinition(definition));

    byId.set(targetEntry.id, {
      ...currentTarget,
      alternateForms: mergePublicAlternateForms(currentTarget.alternateForms, [alternate]),
      definitions: transferableDefinitions.length ? [...currentTarget.definitions, ...transferableDefinitions] : currentTarget.definitions,
      proficiency: currentTarget.proficiency ?? entry.proficiency,
    });
    if (!order.includes(targetEntry.id)) order.unshift(targetEntry.id);
    removed.add(entry.id);
  }

  return order.flatMap((id) => (removed.has(id) ? [] : byId.get(id) ? [byId.get(id) as LexiconEntry] : []));
}

function attachProficiency(entry: LexiconEntry, topikIndex: TopikIndex | null): LexiconEntry {
  const proficiency = topikBadgeForEntry(entry, topikIndex);
  if (!proficiency.length) return entry;
  return {
    ...entry,
    proficiency,
  };
}

function addInflectionCandidate(
  candidates: InflectionAnalysis[],
  seen: Set<string>,
  surface: string,
  lemma: string,
  label: string,
  description: string,
) {
  const normalizedLemma = lemma.normalize("NFC").trim();
  if (!normalizedLemma || normalizedLemma === surface || normalizedLemma.length < 2 || !normalizedLemma.endsWith("다")) return;
  const key = `${normalizedLemma}:${label}`;
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({
    surface,
    lemma: normalizedLemma,
    forms: [{ label, description }],
  });
}

function addStemCandidate(
  candidates: InflectionAnalysis[],
  seen: Set<string>,
  surface: string,
  stem: string,
  label: string,
  description: string,
) {
  if (!stem) return;
  addInflectionCandidate(candidates, seen, surface, `${stem}다`, label, description);
}

function generateInflectionCandidates(query: string): InflectionAnalysis[] {
  const surface = cleanInflectionSurface(query);
  const candidates: InflectionAnalysis[] = [];
  const seen = new Set<string>();
  if (!surface) return candidates;

  const addHada = (suffix: string, label: string, description: string) => {
    if (!surface.endsWith(suffix)) return;
    const base = surface.slice(0, -suffix.length);
    addInflectionCandidate(candidates, seen, surface, `${base}하다`, label, description);
  };

  [
    ["하시겠습니다", "Honorific future formal polite", "An honorific future/speculative deferential form of 하다."],
    ["하시겠습니까", "Honorific future formal polite question", "An honorific future/speculative deferential interrogative form of 하다."],
    ["하시겠어요", "Honorific future polite", "An honorific future/speculative polite form of 하다."],
    ["하시겠다", "Honorific future plain", "An honorific future/speculative plain form of 하다."],
    ["하셨습니다", "Honorific past formal polite", "An honorific past deferential form of 하다."],
    ["하셨습니까", "Honorific past formal polite question", "An honorific past deferential interrogative form of 하다."],
    ["하셨어요", "Honorific past polite", "An honorific past polite form of 하다."],
    ["하셨다", "Honorific past plain", "An honorific past plain form of 하다."],
    ["하십니다", "Honorific formal polite", "An honorific deferential form of 하다."],
    ["하십니까", "Honorific formal polite question", "An honorific deferential interrogative form of 하다."],
    ["하시오", "Honorific imperative", "An honorific imperative form of 하다."],
    ["했습니다", "Past formal polite", "A past deferential sentence-final form of 하다."],
    ["했습니까", "Past formal polite question", "A past deferential interrogative form of 하다."],
    ["했어요", "Past polite", "A past polite sentence-final form of 하다."],
    ["했어", "Past intimate", "A past intimate sentence-final form of 하다."],
    ["했다", "Past plain", "A past plain dictionary-style form of 하다."],
    ["합니다", "Formal polite", "A deferential sentence-final form of 하다."],
    ["합니까", "Formal polite question", "A deferential interrogative form of 하다."],
    ["하십시오", "Formal polite imperative", "A deferential imperative form of 하다."],
    ["합시다", "Formal polite propositive", "A deferential propositive form of 하다."],
    ["하세요", "Polite imperative", "A polite honorific imperative form of 하다."],
    ["해요", "Polite", "A polite sentence-final form of 하다."],
    ["해서", "Connective", "A connective cause/reason form of 하다."],
    ["하고", "Connective", "A connective/conjunctive form of 하다."],
    ["하면", "Conditional", "A conditional form of 하다."],
    ["하지만", "Contrastive", "A contrastive connective form of 하다."],
    ["하는", "Present determiner", "A present adnominal form of 하다."],
    ["하기", "Gerund", "A nominal/gerund form of 하다."],
    ["함", "Nominal", "A nominalized form of 하다."],
    ["한", "Past determiner", "A past/adjectival adnominal form of 하다."],
    ["할", "Future determiner", "A future/prospective adnominal form of 하다."],
    ["해", "Intimate", "An intimate sentence-final form of 하다."],
  ].forEach(([suffix, label, description]) => addHada(suffix, label, description));

  const addTailStem = (suffix: string, label: string, description: string) => {
    if (!surface.endsWith(suffix)) return;
    addStemCandidate(candidates, seen, surface, surface.slice(0, -suffix.length), label, description);
  };

  [
    ["겠습니다", "Future/speculative formal polite", "A future/speculative deferential sentence-final form."],
    ["겠습니까", "Future/speculative formal polite question", "A future/speculative deferential interrogative form."],
    ["겠어요", "Future/speculative polite", "A future/speculative polite sentence-final form."],
    ["겠어", "Future/speculative intimate", "A future/speculative intimate sentence-final form."],
    ["겠다", "Future/speculative plain", "A future/speculative plain form."],
    ["겠고", "Future/speculative connective", "A future/speculative connective form."],
    ["겠지만", "Future/speculative contrastive", "A future/speculative contrastive form."],
    ["겠으면", "Future/speculative conditional", "A future/speculative conditional form."],
    ["으셨습니다", "Honorific past formal polite", "An honorific past deferential sentence-final form."],
    ["셨습니다", "Honorific past formal polite", "An honorific past deferential sentence-final form."],
    ["으셨습니까", "Honorific past formal polite question", "An honorific past deferential interrogative form."],
    ["셨습니까", "Honorific past formal polite question", "An honorific past deferential interrogative form."],
    ["으셨어요", "Honorific past polite", "An honorific past polite sentence-final form."],
    ["셨어요", "Honorific past polite", "An honorific past polite sentence-final form."],
    ["으셨다", "Honorific past plain", "An honorific past plain form."],
    ["셨다", "Honorific past plain", "An honorific past plain form."],
    ["으십니다", "Honorific formal polite", "An honorific deferential sentence-final form."],
    ["십니다", "Honorific formal polite", "An honorific deferential sentence-final form."],
    ["으십니까", "Honorific formal polite question", "An honorific deferential interrogative form."],
    ["십니까", "Honorific formal polite question", "An honorific deferential interrogative form."],
    ["으세요", "Polite imperative", "A polite honorific imperative form."],
    ["세요", "Polite imperative", "A polite honorific imperative form."],
    ["으시고", "Honorific connective", "An honorific connective form."],
    ["시고", "Honorific connective", "An honorific connective form."],
    ["으시면", "Honorific conditional", "An honorific conditional form."],
    ["시면", "Honorific conditional", "An honorific conditional form."],
    ["으시는", "Honorific present determiner", "An honorific present adnominal form."],
    ["시는", "Honorific present determiner", "An honorific present adnominal form."],
    ["으신", "Honorific past determiner", "An honorific past/adjectival adnominal form."],
    ["신", "Honorific past determiner", "An honorific past/adjectival adnominal form."],
    ["으실", "Honorific future determiner", "An honorific future/prospective adnominal form."],
    ["실", "Honorific future determiner", "An honorific future/prospective adnominal form."],
  ].forEach(([suffix, label, description]) => addTailStem(suffix, label, description));

  [
    ["지 않습니다", "Negative formal polite", "A negative deferential form with 않다."],
    ["지않습니다", "Negative formal polite", "A negative deferential form with 않다."],
    ["지 않습니까", "Negative formal polite question", "A negative deferential interrogative form with 않다."],
    ["지않습니까", "Negative formal polite question", "A negative deferential interrogative form with 않다."],
    ["지 않아요", "Negative polite", "A negative polite form with 않다."],
    ["지않아요", "Negative polite", "A negative polite form with 않다."],
    ["지 않았다", "Negative past plain", "A negative past plain form with 않다."],
    ["지않았다", "Negative past plain", "A negative past plain form with 않다."],
    ["지 않았어요", "Negative past polite", "A negative past polite form with 않다."],
    ["지않았어요", "Negative past polite", "A negative past polite form with 않다."],
    ["지 못합니다", "Inability formal polite", "A deferential inability form with 못하다."],
    ["지못합니다", "Inability formal polite", "A deferential inability form with 못하다."],
    ["지 못해요", "Inability polite", "A polite inability form with 못하다."],
    ["지못해요", "Inability polite", "A polite inability form with 못하다."],
    ["고 있습니다", "Progressive formal polite", "A progressive deferential form with 있다."],
    ["고있습니다", "Progressive formal polite", "A progressive deferential form with 있다."],
    ["고 있어요", "Progressive polite", "A progressive polite form with 있다."],
    ["고있어요", "Progressive polite", "A progressive polite form with 있다."],
  ].forEach(([suffix, label, description]) => addTailStem(suffix, label, description));

  const addSuffixStem = (suffix: string, label: string, description: string) => {
    if (surface.endsWith(suffix)) addStemCandidate(candidates, seen, surface, surface.slice(0, -suffix.length), label, description);
  };

  [
    ["습니다", "Formal polite", "A deferential sentence-final form."],
    ["습니까", "Formal polite question", "A deferential interrogative form."],
    ["으십시오", "Formal polite imperative", "A deferential imperative form."],
    ["읍시다", "Formal polite propositive", "A deferential propositive form."],
    ["으세요", "Polite imperative", "A polite honorific imperative form."],
    ["었어요", "Past polite", "A past polite sentence-final form."],
    ["았어요", "Past polite", "A past polite sentence-final form."],
    ["였어요", "Past polite", "A past polite sentence-final form."],
    ["었습니다", "Past formal polite", "A past deferential sentence-final form."],
    ["았습니다", "Past formal polite", "A past deferential sentence-final form."],
    ["였습니다", "Past formal polite", "A past deferential sentence-final form."],
    ["었습니까", "Past formal polite question", "A past deferential interrogative form."],
    ["았습니까", "Past formal polite question", "A past deferential interrogative form."],
    ["였습니까", "Past formal polite question", "A past deferential interrogative form."],
    ["었어", "Past intimate", "A past intimate sentence-final form."],
    ["았어", "Past intimate", "A past intimate sentence-final form."],
    ["였어", "Past intimate", "A past intimate sentence-final form."],
    ["었다", "Past plain", "A past plain dictionary-style form."],
    ["았다", "Past plain", "A past plain dictionary-style form."],
    ["였다", "Past plain", "A past plain dictionary-style form."],
    ["어요", "Polite", "A polite sentence-final form."],
    ["아요", "Polite", "A polite sentence-final form."],
    ["어서", "Connective", "A connective cause/reason form."],
    ["아서", "Connective", "A connective cause/reason form."],
    ["어도", "Concessive", "A concessive connective form."],
    ["아도", "Concessive", "A concessive connective form."],
    ["으면", "Conditional", "A conditional form."],
    ["어", "Intimate", "An intimate sentence-final form."],
    ["아", "Intimate", "An intimate sentence-final form."],
    ["고", "Connective", "A connective/conjunctive form."],
    ["면", "Conditional", "A conditional form."],
    ["지만", "Contrastive", "A contrastive connective form."],
    ["는데", "Background connective", "A background/contrastive connective form."],
    ["는", "Present determiner", "A present adnominal form."],
    ["은", "Past determiner", "A past/adjectival adnominal form."],
    ["을", "Future determiner", "A future/prospective adnominal form."],
    ["기", "Gerund", "A nominal/gerund form."],
    ["음", "Nominal", "A nominalized form."],
  ].forEach(([suffix, label, description]) => addSuffixStem(suffix, label, description));

  if (surface.endsWith("니다")) {
    addStemCandidate(candidates, seen, surface, withoutFinalConsonant(surface.slice(0, -"니다".length), FINAL_B), "Formal polite", "A deferential sentence-final form.");
  }
  if (surface.endsWith("니까")) {
    addStemCandidate(candidates, seen, surface, withoutFinalConsonant(surface.slice(0, -"니까".length), FINAL_B), "Formal polite question", "A deferential interrogative form.");
  }
  if (surface.endsWith("습니다")) {
    const stemWithPast = surface.slice(0, -"습니다".length);
    const withoutSs = withoutFinalConsonant(stemWithPast, FINAL_SS);
    addStemCandidate(candidates, seen, surface, withoutSs, "Past formal polite", "A past deferential sentence-final form with tense marker ㅆ.");
    addStemCandidate(candidates, seen, surface, contractedLowStem(withoutSs), "Past formal polite contracted", "A past deferential sentence-final form with vowel contraction.");
  }
  if (surface.endsWith("습니까")) {
    const stemWithPast = surface.slice(0, -"습니까".length);
    const withoutSs = withoutFinalConsonant(stemWithPast, FINAL_SS);
    addStemCandidate(candidates, seen, surface, withoutSs, "Past formal polite question", "A past deferential interrogative form with tense marker ㅆ.");
    addStemCandidate(candidates, seen, surface, contractedLowStem(withoutSs), "Past formal polite question contracted", "A past deferential interrogative form with vowel contraction.");
  }
  if (surface.endsWith("요")) {
    const stem = surface.slice(0, -"요".length);
    addStemCandidate(candidates, seen, surface, stem, "Polite", "A polite sentence-final form.");
    addStemCandidate(candidates, seen, surface, contractedLowStem(stem), "Polite contracted", "A polite sentence-final form with vowel contraction.");
  }

  const pastEndings: Array<[string, string]> = [
    ["어요", "Past polite"],
    ["어", "Past intimate"],
    ["다", "Past plain"],
  ];
  for (const [ending, label] of pastEndings) {
    if (!surface.endsWith(ending)) continue;
    const stemWithPast = surface.slice(0, -ending.length);
    const withoutSs = withoutFinalConsonant(stemWithPast, FINAL_SS);
    addStemCandidate(candidates, seen, surface, withoutSs, label, "A past form with tense marker ㅆ.");
    addStemCandidate(candidates, seen, surface, contractedLowStem(withoutSs), `${label} contracted`, "A past form with vowel contraction.");
  }

  const noFinalN = withoutFinalConsonant(surface, FINAL_N);
  addStemCandidate(candidates, seen, surface, noFinalN, "Past determiner", "An adnominal form ending in ㄴ.");
  const noFinalL = withoutFinalConsonant(surface, FINAL_L);
  addStemCandidate(candidates, seen, surface, noFinalL, "Future determiner", "A prospective adnominal form ending in ㄹ.");
  const noFinalM = withoutFinalConsonant(surface, FINAL_M);
  if (Array.from(surface).length > 2) addStemCandidate(candidates, seen, surface, noFinalM, "Nominal", "A nominalized form ending in ㅁ.");

  return candidates;
}

function entryMatchesInflectionLemma(entry: IndexedEntry, lemma: string) {
  const normalized = normalizeSearchText(lemma);
  if (!entry.exactKeys.has(normalized)) return false;
  return entry.definitions.some((definition) => {
    const pos = new Set(definition.pos ?? []);
    const tags = new Set(definition.tags ?? []);
    return pos.has("Verb") || pos.has("Adjective") || tags.has("hada-verb") || tags.has("hada-adjective") || normalizeSearchText(definition.formOf?.reading) === normalized || normalizeSearchText(definition.formOf?.form) === normalized;
  });
}

function hasDirectExactSearchMatch(query: string, entries: IndexedEntry[]) {
  const variants = searchKeyVariants(query);
  return entries.some((entry) => {
    if (!variants.some((variant) => entry.exactKeys.has(variant))) return false;
    return entry.definitions.some((definition) => !INFLECTED_FORM_GLOSS_PATTERN.test(definition.text));
  });
}

function resolveInflectionAnalyses(query: string, searchIndex: SearchIndex) {
  if (hasDirectExactSearchMatch(query, searchIndex.entries)) return [];
  const analyses: InflectionAnalysis[] = [];
  const byLemma = new Map<string, InflectionAnalysis>();

  for (const candidate of generateInflectionCandidates(query)) {
    const matches = searchKeyVariants(candidate.lemma)
      .flatMap((key) => searchIndex.byLookupKey.get(key) ?? [])
      .filter((entry, index, values) => values.findIndex((item) => item.id === entry.id) === index)
      .filter((entry) => entryMatchesInflectionLemma(entry, candidate.lemma));
    if (!matches.length) continue;

    const existing = byLemma.get(candidate.lemma);
    if (existing) {
      for (const form of candidate.forms) {
        if (!existing.forms.some((item) => item.label === form.label)) existing.forms.push(form);
      }
    } else {
      byLemma.set(candidate.lemma, candidate);
      analyses.push(candidate);
    }
  }

  return analyses.slice(0, 3);
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
  return collectRelevantHanja(query, entries).map((character) => {
    const record = metadata.byChar.get(character) ?? emptyHanjaCharacter(character);
    return {
      character: record.character,
      meanings: record.meanings,
      hun: record.hun,
      eum: record.eum,
    };
  });
}

function keyMatchesWildcard(keys: Iterable<string>, pattern: RegExp | null) {
  if (!pattern) return false;
  for (const key of Array.from(keys)) {
    if (pattern.test(key)) return true;
  }
  return false;
}

function scoreEntry(entry: IndexedEntry, query: string, structuralQuery: string, needle: string, structuralNeedle: string, latinNeedle: string, looseNeedle: string) {
  let score = 0;
  const hasCjkQuery = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7a3]/.test(query);
  const wildcardQuery = wildcardRegExp(query);
  const structuralWildcardQuery = structuralQuery !== query ? wildcardRegExp(structuralQuery) : null;
  const latinWildcardQuery = /[a-z0-9]/.test(latinNeedle) ? wildcardRegExp(latinNeedle) : null;
  const looseWildcardQuery = looseNeedle !== latinNeedle && /[a-z0-9]/.test(looseNeedle) ? wildcardRegExp(looseNeedle) : null;

  if (entry.exactKeys.has(query)) score += 1000;
  if (structuralQuery && structuralQuery !== query && entry.exactKeys.has(structuralQuery)) score += 980;
  if (entry.romaja === latinNeedle || entry.romajaLoose === looseNeedle) score += 920;
  if (keyMatchesWildcard(entry.exactKeys, wildcardQuery)) score += 930;
  if (keyMatchesWildcard(entry.exactKeys, structuralWildcardQuery)) score += 910;
  if (latinWildcardQuery?.test(entry.romaja) || looseWildcardQuery?.test(entry.romajaLoose)) score += 880;
  if (entry.prefixKeys.some((key) => key.startsWith(query))) score += 420;
  if (structuralQuery && structuralQuery !== query && entry.prefixKeys.some((key) => key.startsWith(structuralQuery))) score += 400;
  if (latinNeedle && entry.romaja.startsWith(latinNeedle)) score += 380;
  if (looseNeedle && entry.romajaLoose.startsWith(looseNeedle)) score += 360;
  if (hasCjkQuery && entry.prefixKeys.some((key) => key.includes(query))) score += 260;
  if (hasCjkQuery && structuralQuery !== query && entry.prefixKeys.some((key) => key.includes(structuralQuery))) score += 240;
  if (!hasCjkQuery && entry.haystack.includes(needle)) score += 220;
  if (!hasCjkQuery && structuralNeedle && structuralNeedle !== needle && entry.haystack.includes(structuralNeedle)) score += 200;
  if (latinNeedle && entry.romaja.includes(latinNeedle)) score += 170;
  if (looseNeedle && entry.romajaLoose.includes(looseNeedle)) score += 150;

  return score > 0 ? score + (entry.confidence ?? 0) : 0;
}

function scoreEntryForQueryValue(entry: IndexedEntry, value: string) {
  const normalizedQuery = normalizeSearchText(value);
  const structuralQuery = normalizeStructuralSearchText(value);
  return scoreEntry(
    entry,
    normalizedQuery,
    structuralQuery,
    normalizedQuery,
    structuralQuery,
    compactLatin(value),
    loosenRomaja(value),
  );
}

function scoreEntryForParsedQuery(entry: IndexedEntry, parsedQuery: ParsedSearchQuery, topikIndex: TopikIndex | null) {
  if (!entryMatchesFilters(entry, parsedQuery.filters, topikIndex)) return 0;

  if (!parsedQuery.termGroups.length) return 80 + (entry.confidence ?? 0);

  const phraseScore = parsedQuery.terms.length > 1 && parsedQuery.phrase
    ? scoreEntryForQueryValue(entry, parsedQuery.phrase)
    : 0;
  const groupScores = parsedQuery.termGroups.map((group) =>
    Math.max(...group.map((term) => scoreEntryForQueryValue(entry, term))),
  );

  let score = 0;
  if (parsedQuery.requireAllTerms) {
    if (groupScores.some((groupScore) => groupScore <= 0)) return 0;
    score = groupScores.reduce((sum, groupScore) => sum + groupScore, 0);
    if (phraseScore > 0) score += phraseScore + 180;
  } else {
    score = Math.max(phraseScore > 0 ? phraseScore + 180 : 0, ...groupScores);
    const matchedGroups = groupScores.filter((groupScore) => groupScore > 0);
    if (parsedQuery.terms.length > 1 && matchedGroups.length > 1) {
      score = Math.max(score, matchedGroups.reduce((sum, groupScore) => sum + groupScore, 0) + 80);
    }
  }

  if (parsedQuery.filters.length && score > 0) score += parsedQuery.filters.length * 40;
  return score;
}

function toPublicEntry(entry: IndexedEntry): LexiconEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { exactKeys, prefixKeys, haystack, romaja, romajaLoose, ...publicEntry } = entry;
  return publicEntry;
}

function stripPublicCitations(entry: LexiconEntry): LexiconEntry {
  return {
    ...entry,
    provenance: undefined,
    reviewStatus: undefined,
    definitions: entry.definitions.map((definition) => ({
      ...definition,
      sourceIds: undefined,
    })),
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().normalize("NFC") ?? "";
  if (!query) return NextResponse.json({ metadata: {}, entries: [], hanjaCharacters: [] });

  try {
    const searchIndex = await loadSearchIndex();
    const topikIndex = await loadTopikIndex();
    const sentenceBankIndex = await loadSentenceBankIndex();
    const parsedQuery = parseSearchQuery(query, searchIndex);
    const hasWildcardTerm = parsedQuery.termGroups.flat().some((groupTerm) => hasWildcard(groupTerm));
    const inflections = parsedQuery.filters.length || parsedQuery.terms.length !== 1 || hasWildcardTerm
      ? []
      : resolveInflectionAnalyses(query, searchIndex);
    const inflectionLemmas = inflections.map((inflection) => inflection.lemma);
    const entries = mergeNorthKoreanRedirectEntries(
      searchIndex.entries
        .map((entry) => ({
          entry,
          score: Math.max(
            scoreEntryForParsedQuery(entry, parsedQuery, topikIndex),
            ...inflectionLemmas.map((lemma) =>
              entryMatchesInflectionLemma(entry, lemma) ? scoreEntryForQueryValue(entry, lemma) + 760 : 0,
            ),
          ),
        }))
        .filter((result) => result.score > 0)
        .sort((left, right) => {
          if (left.score !== right.score) return right.score - left.score;
          return (right.entry.confidence ?? 0) - (left.entry.confidence ?? 0);
        })
        .map((result) => toPublicEntry(result.entry))
        .map((entry) => resolveSynonymDefinitions(entry, searchIndex.byLookupKey))
        .map(promoteSharedHadaFormEntry)
        .map(dedupePublicDefinitions)
        .map((entry) => attachSentenceExamples(entry, sentenceBankIndex, searchIndex))
        .map((entry) => attachProficiency(entry, topikIndex)),
      searchIndex.byLookupKey,
    )
      .map(stripPublicCitations)
      .slice(0, 100);
    const hanjaMetadata = await loadHanjaMetadata();
    const hanjaCharacters = buildHanjaCharacters(query, entries, hanjaMetadata);

    return NextResponse.json({ metadata: {}, entries, hanjaCharacters, inflections });
  } catch (error) {
    console.error("Failed to search generated lexicon:", error);
    return NextResponse.json(
      { error: "Generated lexicon is missing or invalid. Run npm run lexicon:build.", entries: [], hanjaCharacters: [] },
      { status: 500 },
    );
  }
}
