import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "app", "data", "sources");
const generatedDir = path.join(root, "app", "data", "generated");
const lexiconPath = path.join(generatedDir, "lexicon.json");
const outputPath = path.join(generatedDir, "sentence-bank.json");

function compactWhitespace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(compactWhitespace).filter(Boolean);
  if (typeof value === "string") return value.split(/[|,]/).map(compactWhitespace).filter(Boolean);
  return [];
}

function hasHangul(value) {
  return /[\uac00-\ud7a3]/.test(value);
}

function looksEnglish(value) {
  return /[A-Za-z]/.test(value) && !hasHangul(value);
}

function looksRomanizedKorean(value) {
  return /(?:^|[-\s'])(?:eun|neun|reul|eul|ui|ida|hada|hae|eseo|euro|ro|geos|tteus|imnida|mnida|seumnida|hamnida|rago|iradeun|gateun)(?:$|[-\s'])/i.test(value);
}

function looksTranslatedEnglish(value) {
  const text = compactWhitespace(value);
  if (!looksEnglish(text) || looksRomanizedKorean(text)) return false;
  if (/^(?:ok|yes|no|hello|thanks?|thank you)[.!?]?$/i.test(text)) return true;
  return /\b(?:the|a|an|of|to|in|on|for|with|and|or|is|are|was|were|be|been|being|will|would|can|could|should|may|might|must|do|does|did|have|has|had|i|you|he|she|it|we|they|this|that|these|those|my|your|his|her|their|our)\b/i.test(text);
}

function isFormulaLikeExample(value) {
  return /[+＋→=]|(?:^|\s)-?>|①|②|③|④|⑤|⑥|⑦|⑧|⑨/.test(value);
}

function isSentenceLikeExample(example) {
  const korean = compactWhitespace(example?.korean);
  const english = compactWhitespace(example?.english);
  if (!korean || !looksTranslatedEnglish(english) || isFormulaLikeExample(korean) || isFormulaLikeExample(english)) return false;
  const hangulCount = (korean.match(/[\uac00-\ud7a3]/g) ?? []).length;
  const hasSentencePunctuation = /[.!?。！？]$/.test(korean);
  return hangulCount >= 3 && hasSentencePunctuation;
}

function parseExampleText(value) {
  const text = compactWhitespace(value);
  if (!text) return null;

  const parts = text.split(/\s+―\s+|\s+—\s+|\s+-\s+/).map(compactWhitespace).filter(Boolean);
  if (parts.length === 1 && hasHangul(text) && /[\uac00-\ud7a3][.!?。！？]\s+[A-Za-z]/.test(text)) {
    const sentenceParts = text.split(/(?<=[.!?。！？])\s+(?=[A-Za-z])/).map(compactWhitespace).filter(Boolean);
    return {
      korean: sentenceParts[0],
      english: sentenceParts.length > 1 ? sentenceParts.at(-1) : undefined,
    };
  }

  const korean = parts.find(hasHangul) ?? (hasHangul(text) ? text : "");
  if (!korean) return null;

  return {
    korean,
    english: Array.from(parts).reverse().find(looksEnglish) ?? undefined,
  };
}

function normalizeTerm(value) {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[-‐‑‒–—―]/g, "");
}

function searchTermsForDefinition(entry, definition) {
  const values = [
    entry.hangul,
    entry.hanja,
    ...(entry.alternateHanja ?? []),
    ...(entry.alternateForms ?? []).flatMap((form) => [form.form, form.reading]),
    ...(entry.searchForms ?? []).flatMap((form) => [form.form, form.reading]),
    definition.formOf?.form,
    definition.formOf?.reading,
  ];
  return Array.from(new Set(values.map(normalizeTerm).filter(Boolean)));
}

async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

async function sourceSentenceFiles() {
  if (!existsSync(sourceDir)) return [];
  const files = await readdir(sourceDir);
  return files
    .filter((file) => file.startsWith("sentences.") && (file.endsWith(".jsonl") || file.endsWith(".tsv")))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeSentenceRecord(record, file, index) {
  const korean = compactWhitespace(record.korean ?? record.text ?? record.sentence);
  if (!korean) return null;
  return {
    id: compactWhitespace(record.sourceId) || `sentence:${file}:${index + 1}`,
    korean,
    english: compactWhitespace(record.english ?? record.translation) || undefined,
    source: compactWhitespace(record.sourceName) || compactWhitespace(record.source) || file.replace(/^sentences\.|\.jsonl$|\.tsv$/g, ""),
    license: compactWhitespace(record.license) || undefined,
    terms: stringList(record.terms).map(normalizeTerm).filter(Boolean),
    definitionSourceIds: stringList(record.definitionSourceIds ?? record.senseSourceIds),
  };
}

function normalizeTsvLine(line, file, index) {
  const [sourceId, korean, english, terms, sourceName, license] = line.split("\t");
  return normalizeSentenceRecord({ sourceId, korean, english, terms, sourceName, license }, file, index);
}

function addRecord(records, seen, record) {
  if (!record?.korean) return;
  const key = `${record.korean}\n${record.english ?? ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  records.push({
    ...record,
    terms: Array.from(new Set((record.terms ?? []).map(normalizeTerm).filter(Boolean))),
    definitionSourceIds: Array.from(new Set(record.definitionSourceIds ?? [])),
  });
}

async function build() {
  const records = [];
  const seen = new Set();
  const sourceSummary = {
    lexiconExamples: 0,
    sentenceFiles: {},
  };

  const lexiconRaw = await readFile(lexiconPath, "utf8");
  const lexicon = JSON.parse(lexiconRaw);

  for (const entry of lexicon.entries ?? []) {
    for (const [definitionIndex, definition] of (entry.definitions ?? []).entries()) {
      for (const [exampleIndex, exampleText] of (definition.examples ?? []).entries()) {
        const parsed = parseExampleText(exampleText);
        if (!parsed || !isSentenceLikeExample(parsed)) continue;
        addRecord(records, seen, {
          id: `lexicon:${entry.id}:${definitionIndex + 1}:${exampleIndex + 1}`,
          ...parsed,
          source: "lexicon-example",
          terms: searchTermsForDefinition(entry, definition),
          definitionSourceIds: stringList(definition.sourceIds),
        });
        sourceSummary.lexiconExamples += 1;
      }
    }
  }

  for (const file of await sourceSentenceFiles()) {
    const filePath = path.join(sourceDir, file);
    const before = records.length;
    if (file.endsWith(".jsonl")) {
      const rawRecords = await readJsonl(filePath);
      rawRecords.forEach((record, index) => addRecord(records, seen, normalizeSentenceRecord(record, file, index)));
    } else {
      const raw = await readFile(filePath, "utf8");
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith("#"))
        .forEach((line, index) => addRecord(records, seen, normalizeTsvLine(line, file, index)));
    }
    sourceSummary.sentenceFiles[file] = records.length - before;
  }

  records.sort((left, right) => left.korean.localeCompare(right.korean, "ko") || left.id.localeCompare(right.id));
  await mkdir(generatedDir, { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        metadata: {
          builtAt: new Date().toISOString(),
          sourceSummary,
          entryCount: records.length,
        },
        entries: records,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Wrote ${records.length} sentence-bank records to ${path.relative(root, outputPath)}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
