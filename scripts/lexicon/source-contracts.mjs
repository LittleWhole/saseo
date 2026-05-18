import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const SOURCE_CONTRACT_VERSION = "saseo-source-v1";

const POS_NORMALIZATION = new Map([
  ["adj", "Adjective"],
  ["noun", "Noun"],
  ["verb", "Verb"],
  ["adjective", "Adjective"],
  ["adv", "Adverb"],
  ["adverb", "Adverb"],
  ["proper noun", "Proper noun"],
  ["name", "Proper noun"],
  ["suffix", "Suffix"],
  ["prefix", "Prefix"],
]);

const SOURCE_KINDS = [
  {
    kind: "koSense",
    prefix: "ko-senses.",
    description: "Korean/Hanja sense spine records",
  },
  {
    kind: "englishGloss",
    prefix: "english-glosses.",
    description: "Korean-English gloss candidates before Hanja alignment",
  },
  {
    kind: "lexiconEntry",
    prefix: "lexicon-entries.",
    description: "Fully aligned public lexicon entries",
  },
  {
    kind: "sentenceBank",
    prefix: "sentences.",
    description: "Example sentences aligned to terms or source definition ids",
  },
];

export function normalizePos(pos) {
  if (Array.isArray(pos)) return pos.flatMap(normalizePos).filter(Boolean);
  if (!pos) return ["Word"];
  const normalized = POS_NORMALIZATION.get(String(pos).toLowerCase());
  return [normalized ?? String(pos)];
}

function compactWhitespace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(compactWhitespace).filter(Boolean);
}

function numberOrDefault(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sourceNameFromId(sourceId) {
  return compactWhitespace(sourceId).split(":")[0] || "unknown";
}

function sourceIdForRecord(record, fileInfo, index) {
  return compactWhitespace(record.sourceId) || `${fileInfo.kind}:${fileInfo.file}:${index + 1}`;
}

function assertRequired(record, fileInfo, index, fields) {
  const missing = fields.filter((field) => !compactWhitespace(record[field]));
  if (missing.length === 0) return;
  throw new Error(
    `Invalid ${fileInfo.kind} source record in ${fileInfo.file}:${index + 1}; missing ${missing.join(", ")}`,
  );
}

function normalizeAlternateForms(forms) {
  if (!Array.isArray(forms)) return [];
  return forms
    .map((form) => ({
      form: compactWhitespace(form.form),
      reading: compactWhitespace(form.reading) || undefined,
      label: compactWhitespace(form.label) || undefined,
    }))
    .filter((form) => form.form);
}

function normalizeDefinition(definition, fallbackSourceId) {
  return {
    text: compactWhitespace(definition.text),
    pos: normalizePos(definition.pos),
    examples: stringList(definition.examples),
    tags: stringList(definition.tags),
    senseGroup: definition.senseGroup?.label
      ? {
          label: compactWhitespace(definition.senseGroup.label),
        }
      : undefined,
    discriminator: compactWhitespace(definition.discriminator) || undefined,
    formOf: definition.formOf
      ? {
          form: compactWhitespace(definition.formOf.form),
          reading: compactWhitespace(definition.formOf.reading) || undefined,
          label: compactWhitespace(definition.formOf.label) || undefined,
        }
      : undefined,
    sourceIds: stringList(definition.sourceIds).length ? stringList(definition.sourceIds) : [fallbackSourceId],
    confidence: numberOrDefault(definition.confidence, undefined),
  };
}

function normalizeKoSense(record, fileInfo, index) {
  assertRequired(record, fileInfo, index, ["hangul", "hanja", "koDefinition"]);
  const sourceId = sourceIdForRecord(record, fileInfo, index);
  return {
    sourceId,
    sourceName: compactWhitespace(record.sourceName) || sourceNameFromId(sourceId),
    sourceKind: "koSense",
    sourceFile: fileInfo.file,
    hangul: compactWhitespace(record.hangul),
    hanja: compactWhitespace(record.hanja),
    pos: normalizePos(record.pos),
    koDefinition: compactWhitespace(record.koDefinition),
    enDefinitionHint: compactWhitespace(record.enDefinitionHint),
    domains: stringList(record.domains),
    tags: stringList(record.tags),
    examples: stringList(record.examples),
    sourceRank: numberOrDefault(record.sourceRank, 0.85),
  };
}

function normalizeEnglishGloss(record, fileInfo, index) {
  assertRequired(record, fileInfo, index, ["hangul"]);
  const sourceId = sourceIdForRecord(record, fileInfo, index);
  const glosses = stringList(record.glosses);
  if (glosses.length === 0) {
    throw new Error(`Invalid englishGloss source record in ${fileInfo.file}:${index + 1}; missing glosses`);
  }

  return {
    sourceId,
    sourceName: compactWhitespace(record.sourceName) || sourceNameFromId(sourceId),
    sourceKind: "englishGloss",
    sourceFile: fileInfo.file,
    hangul: compactWhitespace(record.hangul),
    pos: normalizePos(record.pos),
    glosses,
    domains: stringList(record.domains),
    tags: stringList(record.tags),
    examples: stringList(record.examples),
    sourceRank: numberOrDefault(record.sourceRank, 0.75),
  };
}

function normalizeLexiconEntry(record, fileInfo, index) {
  assertRequired(record, fileInfo, index, ["hangul", "hanja"]);
  const sourceId = sourceIdForRecord(record, fileInfo, index);
  const definitions = Array.isArray(record.definitions)
    ? record.definitions.map((definition) => normalizeDefinition(definition, sourceId)).filter((definition) => definition.text)
    : [];
  if (definitions.length === 0) {
    throw new Error(`Invalid lexiconEntry source record in ${fileInfo.file}:${index + 1}; missing definitions`);
  }

  const sourceName = compactWhitespace(record.sourceName) || sourceNameFromId(sourceId);
  const confidence = numberOrDefault(record.confidence, numberOrDefault(record.sourceRank, 0.82));
  return {
    id: compactWhitespace(record.id) || `source:${sourceId}`,
    hangul: compactWhitespace(record.hangul),
    hanja: compactWhitespace(record.hanja),
    alternateHanja: stringList(record.alternateHanja),
    alternateForms: normalizeAlternateForms(record.alternateForms),
    searchForms: normalizeAlternateForms(record.searchForms),
    definitions,
    provenance: stringList(record.provenance).length ? stringList(record.provenance) : [sourceId],
    confidence,
    reviewStatus: compactWhitespace(record.reviewStatus) || "trusted-source",
    sourceName,
    sourceKind: "lexiconEntry",
    sourceFile: fileInfo.file,
  };
}

function normalizeSentenceBank(record, fileInfo, index) {
  assertRequired(record, fileInfo, index, ["korean"]);
  const sourceId = sourceIdForRecord(record, fileInfo, index);
  return {
    sourceId,
    sourceName: compactWhitespace(record.sourceName) || sourceNameFromId(sourceId),
    sourceKind: "sentenceBank",
    sourceFile: fileInfo.file,
    korean: compactWhitespace(record.korean),
    english: compactWhitespace(record.english ?? record.translation) || undefined,
    terms: stringList(record.terms),
    definitionSourceIds: stringList(record.definitionSourceIds ?? record.senseSourceIds),
    license: compactWhitespace(record.license) || undefined,
    sourceRank: numberOrDefault(record.sourceRank, 0.7),
  };
}

const NORMALIZERS = {
  koSense: normalizeKoSense,
  englishGloss: normalizeEnglishGloss,
  lexiconEntry: normalizeLexiconEntry,
  sentenceBank: normalizeSentenceBank,
};

export async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

async function sourceFiles(sourceDir) {
  if (!existsSync(sourceDir)) return [];
  const files = await readdir(sourceDir);
  return SOURCE_KINDS.flatMap((kind) =>
    files
      .filter((file) => file.startsWith(kind.prefix) && file.endsWith(".jsonl"))
      .sort((left, right) => left.localeCompare(right))
      .map((file) => ({
        ...kind,
        file,
        path: path.join(sourceDir, file),
      })),
  );
}

function summarizeRecords(records) {
  const bySourceName = {};
  for (const record of records) {
    const sourceName = record.sourceName ?? "unknown";
    bySourceName[sourceName] = (bySourceName[sourceName] ?? 0) + 1;
  }
  return bySourceName;
}

export async function loadNormalizedSources({ root, sourceDir = path.join(root, "app", "data", "sources"), decisionsPath = path.join(root, "app", "data", "review-decisions.jsonl") }) {
  const files = await sourceFiles(sourceDir);
  const buckets = {
    koSenses: [],
    englishEntries: [],
    lexiconEntries: [],
    sentenceEntries: [],
  };
  const manifestFiles = [];

  for (const fileInfo of files) {
    const rawRecords = await readJsonl(fileInfo.path);
    const normalizer = NORMALIZERS[fileInfo.kind];
    const normalized = rawRecords.map((record, index) => normalizer(record, fileInfo, index));
    if (fileInfo.kind === "koSense") buckets.koSenses.push(...normalized);
    if (fileInfo.kind === "englishGloss") buckets.englishEntries.push(...normalized);
    if (fileInfo.kind === "lexiconEntry") buckets.lexiconEntries.push(...normalized);
    if (fileInfo.kind === "sentenceBank") buckets.sentenceEntries.push(...normalized);

    manifestFiles.push({
      kind: fileInfo.kind,
      file: fileInfo.file,
      description: fileInfo.description,
      records: normalized.length,
      sources: summarizeRecords(normalized),
    });
  }

  const reviewed = await readJsonl(decisionsPath);
  return {
    ...buckets,
    reviewed,
    manifest: {
      contractVersion: SOURCE_CONTRACT_VERSION,
      files: manifestFiles,
      counts: {
        koSenseCount: buckets.koSenses.length,
        englishEntryCount: buckets.englishEntries.length,
        lexiconEntryCount: buckets.lexiconEntries.length,
        sentenceEntryCount: buckets.sentenceEntries.length,
        reviewedDecisionCount: reviewed.length,
      },
    },
  };
}
