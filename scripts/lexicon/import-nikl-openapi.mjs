#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseStringPromise } from "xml2js";

const root = process.cwd();
const sourceDir = path.join(root, "app", "data", "sources");
const generatedLexiconPath = path.join(root, "app", "data", "generated", "lexicon.json");

const SOURCE_CONFIG = {
  krdict: {
    endpoint: "https://krdict.korean.go.kr/api/search",
    envKey: "KRDICT_API_KEY",
    defaultOut: path.join(sourceDir, "english-glosses.krdict.jsonl"),
  },
  urimalsaem: {
    endpoint: "https://opendict.korean.go.kr/api/search",
    envKey: "URIMALSAEM_API_KEY",
    defaultOut: path.join(sourceDir, "ko-senses.urimalsaem.jsonl"),
  },
};

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object" && "_" in value) return text(value._);
  return "";
}

function stripCaret(value) {
  return text(value).replace(/\^/g, "").trim();
}

function containsHanja(value) {
  return /[\u4E00-\u9FFF]/u.test(text(value));
}

function cleanHanja(value) {
  return text(value)
    .replace(/\^/g, "")
    .replace(/[^\uAC00-\uD7AF\u4E00-\u9FFF]/gu, "")
    .trim();
}

function normalizePos(pos) {
  const value = text(pos);
  if (!value) return ["Word"];
  return [value.replace(/\s+/g, " ")];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function collectStringsByKey(node, keyPattern, output = []) {
  if (!node || typeof node !== "object") return output;
  for (const [key, value] of Object.entries(node)) {
    if (keyPattern.test(key)) {
      for (const item of asArray(value)) {
        if (typeof item === "object") collectStringsByKey(item, /.*/u, output);
        else output.push(text(item));
      }
    } else if (typeof value === "object") {
      for (const item of asArray(value)) collectStringsByKey(item, keyPattern, output);
    }
  }
  return output;
}

function firstHanjaOrigin(item) {
  const direct = [
    item.origin,
    item.original_language,
    item.hanja,
    item.word_info?.original_language_info?.original_language,
  ];
  const recursive = collectStringsByKey(item, /origin|original|hanja|han/i);
  return [...direct, ...recursive].map(cleanHanja).find(containsHanja) ?? "";
}

function sensesFromItem(item) {
  return [
    ...asArray(item.sense),
    ...asArray(item.senses?.sense),
    ...asArray(item.word_info?.sense_info),
    ...asArray(item.word_info?.sense_info?.sense),
  ].filter(Boolean);
}

function translationsFromSense(sense) {
  const translations = asArray(sense.translation).flatMap((translation) => [
    translation.trans_word,
    translation.trans_dfn,
  ]);
  return unique(translations);
}

async function parseResponse(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    return parseStringPromise(raw, {
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
    });
  }
}

function responseItems(parsed) {
  return [
    ...asArray(parsed?.channel?.item),
    ...asArray(parsed?.channel?.items?.item),
    ...asArray(parsed?.item),
    ...asArray(parsed?.items?.item),
  ].filter(Boolean);
}

async function loadTerms() {
  const termsPath = getArg("terms");
  if (termsPath) {
    const raw = await readFile(path.resolve(root, termsPath), "utf8");
    return unique(raw.split(/\r?\n/).map((line) => line.trim()));
  }

  if (!hasFlag("terms-from-generated-hangul-only")) {
    throw new Error("Provide --terms=path or --terms-from-generated-hangul-only.");
  }

  if (!existsSync(generatedLexiconPath)) {
    throw new Error("Generated lexicon is missing. Run npm run lexicon:build:wiktionary first.");
  }

  const lexicon = JSON.parse(await readFile(generatedLexiconPath, "utf8"));
  return unique(
    (lexicon.entries ?? [])
      .filter((entry) => entry.hangul && entry.hanja === entry.hangul)
      .map((entry) => entry.hangul),
  );
}

async function fetchItems(source, key, term) {
  const config = SOURCE_CONFIG[source];
  const params = new URLSearchParams({
    key,
    q: term,
    start: "1",
    num: "100",
    method: "exact",
    part: "word",
  });

  if (source === "krdict") {
    params.set("translated", "y");
    params.set("trans_lang", "1");
  } else {
    params.set("req_type", "json");
    params.set("advanced", "y");
  }

  const response = await fetch(`${config.endpoint}?${params.toString()}`);
  if (!response.ok) throw new Error(`${source} ${term}: HTTP ${response.status}`);
  const parsed = await parseResponse(response);
  return responseItems(parsed);
}

function normalizeKrdictItems(items) {
  return items.flatMap((item) => {
    const glosses = unique(
      sensesFromItem(item).flatMap((sense) => [...translationsFromSense(sense), sense.definition]),
    );
    if (glosses.length === 0) return [];

    const origin = firstHanjaOrigin(item);
    return [
      {
        sourceId: `krdict:${text(item.target_code) || stripCaret(item.word)}`,
        hangul: stripCaret(item.word),
        pos: normalizePos(item.pos),
        glosses,
        tags: ["krdict", ...(origin ? ["hanja-origin"] : [])],
        sourceRank: 0.9,
      },
    ];
  });
}

function normalizeUrimalsaemItems(items) {
  return items.flatMap((item, itemIndex) => {
    const hangul = stripCaret(item.word || item.word_info?.word);
    const hanja = firstHanjaOrigin(item);
    if (!hangul || !hanja) return [];

    return sensesFromItem(item).flatMap((sense, senseIndex) => {
      const definition = text(sense.definition || sense.sense_definition);
      if (!definition) return [];

      return {
        sourceId: `urimalsaem:${text(item.target_code) || hangul}:${text(sense.sense_order) || senseIndex}:${itemIndex}`,
        hangul,
        hanja,
        pos: normalizePos(item.pos || item.word_info?.pos),
        koDefinition: definition,
        domains: unique([sense.cat, sense.category, sense.domain, item.category]),
        tags: ["hanja-backed", "urimalsaem"],
        sourceRank: 0.98,
      };
    });
  });
}

async function main() {
  const source = getArg("source", "urimalsaem");
  const config = SOURCE_CONFIG[source];
  if (!config) throw new Error(`Unknown source "${source}". Use krdict or urimalsaem.`);

  const key = getArg("key") || process.env[config.envKey];
  if (!key) throw new Error(`Missing API key. Set ${config.envKey} or pass --key=...`);

  const outPath = path.resolve(root, getArg("out", config.defaultOut));
  const terms = await loadTerms();
  const limit = Number(getArg("limit", terms.length));
  const selectedTerms = terms.slice(0, Number.isFinite(limit) ? limit : terms.length);

  const records = [];
  for (const term of selectedTerms) {
    const items = await fetchItems(source, key, term);
    records.push(...(source === "krdict" ? normalizeKrdictItems(items) : normalizeUrimalsaemItems(items)));
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  console.log(`Wrote ${records.length} ${source} records to ${path.relative(root, outPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
