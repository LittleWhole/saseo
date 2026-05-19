#!/usr/bin/env node

import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadNormalizedSources, normalizePos, SOURCE_CONTRACT_VERSION } from "./source-contracts.mjs";

const root = process.cwd();
const generatedDir = path.join(root, "app", "data", "generated");
const sourceDir = path.join(root, "app", "data", "sources");
const lexiconPath = path.join(generatedDir, "lexicon.json");
const reviewQueuePath = path.join(generatedDir, "review-queue.json");
const coverageReportPath = path.join(generatedDir, "hanja-coverage-report.json");
const hunmongJahoeReadingsPath = path.join(generatedDir, "hunmong-jahoe-readings.json");
const decisionsPath = path.join(root, "app", "data", "review-decisions.jsonl");

const DERIVED_SUFFIX_RULES = [
  { suffix: "적이다", hanjaSuffix: "的이다", label: "derived suffix -적이다" },
  { suffix: "적으로", hanjaSuffix: "的으로", label: "derived suffix -적으로" },
  { suffix: "화시키다", hanjaSuffix: "化시키다", label: "derived suffix -화시키다" },
  { suffix: "화하다", hanjaSuffix: "化하다", label: "derived suffix -화하다" },
  { suffix: "화되다", hanjaSuffix: "化되다", label: "derived suffix -화되다" },
  { suffix: "시키다", hanjaSuffix: "시키다", label: "derived suffix -시키다" },
  { suffix: "스럽다", hanjaSuffix: "스럽다", label: "derived suffix -스럽다" },
  { suffix: "되다", hanjaSuffix: "되다", label: "derived suffix -되다" },
  { suffix: "하다", hanjaSuffix: "하다", label: "derived suffix -하다" },
  { suffix: "로이", hanjaSuffix: "로이", label: "derived suffix -로이" },
  { suffix: "롭다", hanjaSuffix: "롭다", label: "derived suffix -롭다" },
  { suffix: "적인", hanjaSuffix: "的인", label: "derived suffix -적인" },
  { suffix: "적", hanjaSuffix: "的", label: "derived suffix -적" },
  { suffix: "화", hanjaSuffix: "化", label: "derived suffix -화" },
  { suffix: "성", hanjaSuffix: "性", label: "derived suffix -성" },
  { suffix: "히", hanjaSuffix: "히", label: "derived suffix -히" },
].sort((left, right) => right.suffix.length - left.suffix.length);

const PRODUCTIVE_FORM_FOLDING_RULES = [
  { suffix: "하다", hanjaSuffix: "하다", alternateLabel: "hada form" },
  { suffix: "히", hanjaSuffix: "히", alternateLabel: "hi form" },
];

const DUEUM_CANONICAL_LABEL = "North Korea, Yanbian, or archaic";
const DUEUM_IOTIZED_JUNG_INDEXES = new Set([2, 3, 6, 7, 12, 17, 20]);
const MIXED_SCRIPT_FORM_OF_PATTERN = /^Hanja-Hangul mixed script form of\b/u;

const HANJA_SEMANTICS = new Map([
  ["防", ["prevent", "block", "protect", "proof", "waterproof", "waterproofing", "resistance", "resistant", "guard"]],
  ["水", ["water", "liquid", "river"]],
  ["放", ["release", "emit", "discharge", "let go"]],
  ["首", ["capital", "head", "chief", "first"]],
  ["都", ["capital", "city", "metropolis"]],
  ["修", ["practice", "study", "cultivate", "discipline"]],
  ["道", ["way", "road", "method", "religion", "waterworks"]],
  ["記", ["record", "write", "article", "note"]],
  ["者", ["person", "one who", "agent"]],
  ["技", ["skill", "technique", "craft"]],
  ["士", ["specialist", "officer", "scholar"]],
]);

const MIDDLE_KOREAN_SOURCE_LABELS = new Map([
  ["bn", "Beonyeok Nogeoldae"],
  ["dk", "Dongguk Jeongun"],
  ["gy", "Jilin Leishi"],
  ["hj", "Hunmin Jeongeum"],
  ["hm", "Hunmong Jahoe"],
  ["ss", "Seokbo Sangjeol"],
  ["yb", "Yongbi Eocheon'ga"],
]);

function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .flatMap((token) => {
      const stems = [token];
      if (token.endsWith("ing") && token.length > 5) stems.push(token.slice(0, -3));
      if (token.endsWith("ed") && token.length > 4) stems.push(token.slice(0, -2));
      if (token.endsWith("s") && token.length > 3) stems.push(token.slice(0, -1));
      return stems;
    });
}

function jaccard(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let intersection = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) intersection += 1;
  }
  return intersection / (leftSet.size + rightSet.size - intersection);
}

function posScore(leftPos, rightPos) {
  const left = new Set(normalizePos(leftPos));
  const right = new Set(normalizePos(rightPos));
  if (left.has("Word") || right.has("Word")) return 0.4;
  for (const pos of left) {
    if (right.has(pos)) return 1;
  }
  return 0;
}

function hanjaSemanticScore(hanja, gloss) {
  const glossTokens = new Set(tokenize(gloss));
  const semanticTokens = [];
  for (const char of String(hanja ?? "")) {
    semanticTokens.push(...(HANJA_SEMANTICS.get(char) ?? []));
  }
  if (semanticTokens.length === 0 || glossTokens.size === 0) return 0;
  let hits = 0;
  for (const token of semanticTokens) {
    if (glossTokens.has(token)) hits += 1;
  }
  return Math.min(1, hits / 2);
}

function domainScore(koSense, enSense) {
  const koDomains = new Set(koSense.domains ?? []);
  const enDomains = new Set(enSense.domains ?? []);
  if (koDomains.size === 0 || enDomains.size === 0) return 0.2;
  for (const domain of koDomains) {
    if (enDomains.has(domain)) return 1;
  }
  return 0;
}

function scorePair(koSense, enGloss, enSense) {
  const koText = [
    koSense.koDefinition,
    koSense.enDefinitionHint,
    ...(koSense.examples ?? []),
    ...(koSense.tags ?? []),
    ...(koSense.domains ?? []),
  ].join(" ");
  const lexical = jaccard(tokenize(koText), tokenize(enGloss));
  const character = hanjaSemanticScore(koSense.hanja, enGloss);
  const pos = posScore(koSense.pos, enSense.pos);
  const domain = domainScore(koSense, enSense);

  return (
    0.38 * lexical +
    0.24 * character +
    0.18 * pos +
    0.12 * domain +
    0.08 * (koSense.sourceRank ?? 0.5)
  );
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

async function loadHanjaReadings() {
  const filePath = path.join(root, "app", "data", "hanja.txt");
  if (!existsSync(filePath)) return new Map();

  const content = await readFile(filePath, "utf8");
  const readings = new Map();
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [reading, char] = line.split(":");
    if (!reading || !char || !/[\u4E00-\u9FFF]/u.test(char)) continue;
    const values = readings.get(char) ?? new Set();
    values.add(reading);
    readings.set(char, values);
  }
  return readings;
}

async function loadHunmongJahoeMiddleKoreanReadings() {
  if (!existsSync(hunmongJahoeReadingsPath)) {
    return {
      metadata: null,
      readings: [],
    };
  }

  const parsed = JSON.parse(await readFile(hunmongJahoeReadingsPath, "utf8"));
  return {
    metadata: parsed.metadata ?? null,
    readings: Array.isArray(parsed.readings) ? parsed.readings : [],
  };
}

function isKoreanScript(char) {
  return /[\uAC00-\uD7AF\u4E00-\u9FFF]/u.test(char);
}

function isHanja(char) {
  return /[\u4E00-\u9FFF]/u.test(char);
}

function isStructuralScriptUnit(char) {
  return /[\uAC00-\uD7AF\u4E00-\u9FFF0-9]/u.test(char);
}

function compactScript(value) {
  return Array.from(String(value ?? ""))
    .filter(isStructuralScriptUnit)
    .join("");
}

function compactHangul(value) {
  return Array.from(String(value ?? ""))
    .filter((char) => /[\uAC00-\uD7AF0-9]/u.test(char))
    .join("");
}

function scriptFormMatchesReading(form, hangul, hanjaReadings) {
  const scriptChars = Array.from(compactScript(form));
  const hangulChars = Array.from(compactHangul(hangul));
  if (scriptChars.length !== hangulChars.length || scriptChars.length === 0) return false;
  if (!scriptChars.some(isHanja)) return false;

  return scriptChars.every((char, index) => {
    if (/[0-9]/u.test(char)) return char === hangulChars[index];
    if (/[\uAC00-\uD7AF]/u.test(char)) return char === hangulChars[index];
    if (!/[\uAC00-\uD7AF]/u.test(hangulChars[index])) return false;
    const readings = hanjaReadings.get(char);
    return !readings || readings.size === 0 || readings.has(hangulChars[index]);
  });
}

function filterReadableScriptForms(forms, hangul, hanjaReadings) {
  return uniqueValues(forms).filter((form) => scriptFormMatchesReading(form, hangul, hanjaReadings));
}

function hasKoreanScript(value) {
  return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/u.test(String(value ?? ""));
}

function cleanMiddleKoreanForm(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\^\S+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function middleKoreanFormFromHtml(value) {
  const html = String(value ?? "");
  const langMatch = html.match(/lang=["']okm["'][^>]*>([^<]+)</u);
  return cleanMiddleKoreanForm(langMatch?.[1] ?? html.match(/>([^<]+)</u)?.[1] ?? html);
}

function middleKoreanYaleFromHtml(value) {
  return String(value ?? "").match(/Yale:\s*([^)<]+)/u)?.[1]?.trim();
}

function middleKoreanSourceFromCode(code, fallback = "wiktionary") {
  return MIDDLE_KOREAN_SOURCE_LABELS.get(String(code ?? "")) ?? fallback;
}

function hasMalformedMiddleKoreanBoundary(value) {
  return /(^|[\s/])[\u11A8-\u11FF〮〯]/u.test(String(value ?? ""));
}

function middleKoreanRecord(form, yale, source, confidence = 0.9) {
  const cleanedForm = cleanMiddleKoreanForm(form);
  if (!cleanedForm || !hasKoreanScript(cleanedForm)) return null;
  if (hasMalformedMiddleKoreanBoundary(cleanedForm)) return null;
  return {
    form: cleanedForm,
    yale: String(yale ?? "").trim() || undefined,
    source,
    confidence,
  };
}

function mergeMiddleKoreanForms(...groups) {
  const merged = [];
  for (const form of groups.flat().filter(Boolean)) {
    const sources = (Array.isArray(form.source) ? form.source.flat(Infinity) : [form.source]).filter(Boolean);
    const existing = merged.find((candidate) =>
      candidate.form === form.form &&
      (candidate.yale === form.yale || !candidate.yale || !form.yale)
    );
    if (!existing) {
      merged.push({
        ...form,
        source: sources,
      });
      continue;
    }
    if (!existing.yale && form.yale) existing.yale = form.yale;
    for (const source of sources) {
      if (!existing.source.includes(source)) existing.source.push(source);
    }
    existing.confidence = Math.max(existing.confidence ?? 0, form.confidence ?? 0);
  }
  return merged.sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0));
}

function extractTemplateMiddleKoreanForms(entry) {
  const forms = [];
  let nextOkmSource = "";

  for (const template of entry.etymology_templates ?? []) {
    const args = template.args ?? {};
    const name = template.name ?? "";

    if (name === "ko-etym-native" && args["2"] && hasKoreanScript(args["2"]) && /Middle Korean/u.test(template.expansion ?? entry.etymology_text ?? "")) {
      forms.push(middleKoreanRecord(args["2"], args["3"], middleKoreanSourceFromCode(args["1"], "Wiktionary etymology"), 0.95));
      nextOkmSource = "";
      continue;
    }

    if ((name === "inh" || name === "der") && args["2"] === "okm") {
      if (args["3"] && args["3"] !== "-") {
        forms.push(middleKoreanRecord(args["3"], args.tr, "Wiktionary etymology", 0.92));
        nextOkmSource = "";
      } else {
        nextOkmSource = "Wiktionary etymology";
      }
      continue;
    }

    if ((name === "okm-l" || name === "okm-inline") && nextOkmSource) {
      forms.push(middleKoreanRecord(args["1"], args["2"], nextOkmSource, 0.9));
      nextOkmSource = "";
      continue;
    }

    if (name !== "anchor" && name !== "number box") nextOkmSource = "";
  }

  return mergeMiddleKoreanForms(forms);
}

function modernHanjaReadingsFromEntry(entry) {
  const readings = [];
  for (const template of entry.etymology_templates ?? []) {
    const sort = template.args?.sort;
    if (sort && /^[\uAC00-\uD7AF]+$/u.test(sort)) readings.push(sort);
  }
  for (const sound of entry.sounds ?? []) {
    const reading = String(sound.hangeul ?? "").replace(/[()ː:]/gu, "").trim();
    if (reading && /^[\uAC00-\uD7AF]+$/u.test(reading)) readings.push(reading);
  }
  for (const form of entry.forms ?? []) {
    if (!form.tags?.includes("eumhun")) continue;
    const reading = String(form.form ?? "").trim().split(/\s+/u).at(-1);
    if (reading && /^[\uAC00-\uD7AF]+$/u.test(reading)) readings.push(reading);
  }
  return uniqueValues(readings);
}

function extractHanjaEtymologyMiddleKoreanForms(entry) {
  const forms = [];
  for (const template of entry.etymology_templates ?? []) {
    const args = template.args ?? {};
    const name = template.name ?? "";
    if (name === "hanja-hunmong") {
      forms.push(middleKoreanRecord(args["1"], args["2"], "Hunmong Jahoe", 0.98));
      continue;
    }
    if (name === "hanja-dongguk") {
      forms.push(middleKoreanRecord(args["1"], args["2"], "Dongguk Jeongun", 0.96));
      continue;
    }
    if (name === "hanja-ety") {
      for (const [key, value] of Object.entries(args)) {
        if (key === "dk") {
          forms.push(middleKoreanRecord(middleKoreanFormFromHtml(value), middleKoreanYaleFromHtml(value), "Dongguk Jeongun", 0.94));
        }
        if (/^m\d*$/u.test(key)) {
          forms.push(middleKoreanRecord(middleKoreanFormFromHtml(value), middleKoreanYaleFromHtml(value), "Hunmong Jahoe", 0.94));
        }
      }
    }
  }

  const text = String(entry.etymology_text ?? "");
  for (const match of text.matchAll(/Recorded as Middle Korean\s+(?:[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+\/)?([^\s(,]+)(?:\s+\(([^)]+)\))?\s+\(Yale:\s*([^)]+)\)\s+in\s+([^,.]+?)(?:,|\.)/gu)) {
    const source = match[4]?.includes("Dongguk") || match[4]?.includes("동국정운")
      ? "Dongguk Jeongun"
      : match[4]?.includes("Hunmong") || match[4]?.includes("훈몽자회")
        ? "Hunmong Jahoe"
        : "Wiktionary etymology";
    forms.push(middleKoreanRecord(match[1], match[3] ?? match[2], source, 0.9));
  }

  return mergeMiddleKoreanForms(forms);
}

function buildMiddleKoreanHanjaIndex(entries, hunmongJahoeReadings = []) {
  const byCharacterAndReading = new Map();

  for (const entry of entries) {
    if (entry.lang_code !== "ko" || entry.pos !== "character" || !/^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/u.test(entry.word ?? "")) continue;
    const forms = extractHanjaEtymologyMiddleKoreanForms(entry);
    if (!forms.length) continue;
    for (const reading of modernHanjaReadingsFromEntry(entry)) {
      const key = `${entry.word}\u0000${reading}`;
      byCharacterAndReading.set(key, mergeMiddleKoreanForms(byCharacterAndReading.get(key) ?? [], forms));
    }
  }

  for (const reading of hunmongJahoeReadings) {
    if (!reading?.character || !reading?.reading || !reading?.form) continue;
    const key = `${reading.character}\u0000${reading.reading}`;
    byCharacterAndReading.set(
      key,
      mergeMiddleKoreanForms(
        byCharacterAndReading.get(key) ?? [],
        [middleKoreanRecord(reading.form, reading.yale, "Hunmong Jahoe (Wikisource)", 0.99)],
      ),
    );
  }

  return byCharacterAndReading;
}

function selectMiddleKoreanHanjaForm(forms) {
  if (!forms?.length) return null;
  return forms.find((form) => form.source?.includes("Hunmong Jahoe")) ?? forms[0];
}

function composeMiddleKoreanHanjaTerm(hanja, hangul, hanjaMiddleKoreanIndex) {
  const hanjaUnits = structuralUnits(hanja);
  const readingUnits = structuralUnits(hangul);
  if (!hanjaUnits.length || hanjaUnits.length !== readingUnits.length) return [];
  if (hanjaUnits.some((unit) => !isHanja(unit.char))) return [];

  const parts = [];
  for (let index = 0; index < hanjaUnits.length; index += 1) {
    const forms = hanjaMiddleKoreanIndex.get(`${hanjaUnits[index].char}\u0000${readingUnits[index].char}`);
    const form = selectMiddleKoreanHanjaForm(forms);
    if (!form) return [];
    parts.push(form);
  }

  return mergeMiddleKoreanForms([
    {
      form: parts.map((part) => part.form).join(""),
      yale: parts.every((part) => part.yale) ? parts.map((part) => part.yale).join("-") : undefined,
      source: uniqueValues(parts.flatMap((part) => part.source ?? [])).join(" + "),
      confidence: Math.min(...parts.map((part) => part.confidence ?? 0.85)) - 0.08,
    },
  ]);
}

function isGrammarMorphemeEntry(entry) {
  const pos = String(entry?.pos ?? "").toLowerCase();
  const word = String(entry?.word ?? "");
  return (
    word.includes("-") ||
    ["suffix", "prefix", "particle", "postposition", "ending", "det", "determiner"].includes(pos)
  );
}

function allowsLooseEtymologyMining(entry, hangul) {
  if (isGrammarMorphemeEntry(entry)) return false;
  return Array.from(compactHangul(hangul)).length > 1;
}

function expandDashPlaceholders(form, hangul) {
  if (!form.includes("—")) return form;

  let hangulIndex = 0;
  let output = "";
  const chars = Array.from(form);

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char !== "—") {
      output += char;
      if (isKoreanScript(char)) hangulIndex += 1;
      continue;
    }

    let remainingScriptChars = 0;
    for (const rest of chars.slice(index + 1)) {
      if (isKoreanScript(rest)) remainingScriptChars += 1;
    }
    const end = Math.max(hangulIndex, Array.from(hangul).length - remainingScriptChars);
    output += Array.from(hangul).slice(hangulIndex, end).join("");
    hangulIndex = end;
  }

  return output;
}

function normalizeFormCharacters(value) {
  return Array.from(String(value ?? ""))
    .filter((char) => /[\uAC00-\uD7AF\u4E00-\u9FFF0-9\s-]/u.test(char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function projectReadingStructure(form, hangul) {
  const normalized = normalizeFormCharacters(form);
  if (!normalized) return "";

  const readingChars = Array.from(String(hangul ?? ""));
  const markersByUnit = new Map();
  let readingUnitIndex = 0;
  for (const char of readingChars) {
    if (isStructuralScriptUnit(char)) {
      readingUnitIndex += 1;
      continue;
    }
    if (!/[\s-]/u.test(char)) continue;
    markersByUnit.set(readingUnitIndex, `${markersByUnit.get(readingUnitIndex) ?? ""}${char}`);
  }

  const formHasMarkers = /[\s-]/u.test(normalized);
  let output = formHasMarkers ? "" : markersByUnit.get(0) ?? "";
  let formUnitIndex = 0;
  for (const char of Array.from(normalized)) {
    output += char;
    if (!isStructuralScriptUnit(char)) continue;
    formUnitIndex += 1;
    if (!formHasMarkers) output += markersByUnit.get(formUnitIndex) ?? "";
  }

  return output.trim();
}

function readingSuffixAfterUnits(reading, consumedUnits) {
  let units = 0;
  let index = 0;
  const chars = Array.from(String(reading ?? ""));
  for (; index < chars.length; index += 1) {
    if (!isStructuralScriptUnit(chars[index])) continue;
    units += 1;
    if (units === consumedUnits) {
      index += 1;
      break;
    }
  }
  return chars.slice(index).join("");
}

function normalizeScriptForms(raw, hangul) {
  const pairedForms = extractParentheticalHanjaForms(raw, hangul);
  if (pairedForms.length > 0) return pairedForms;

  const cleaned = String(raw ?? "")
    .replace(/\^/g, "")
    .replace(/—/g, "")
    .replace(/／/g, "/")
    .trim();

  if (!cleaned || !/[\u4E00-\u9FFF]/u.test(cleaned)) return [];

  return String(raw ?? "")
    .replace(/\^/g, "")
    .replace(/／/g, "/")
    .trim()
    .split("/")
    .map((part) => {
      const parenthetical = part.match(/\(([\u4E00-\u9FFF]+)\)/u);
      const source = parenthetical?.[1] ?? expandDashPlaceholders(part, hangul);
      return projectReadingStructure(source, hangul);
    })
    .filter((form) => /[\u4E00-\u9FFF]/u.test(form))
    .filter(Boolean);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractParentheticalHanjaForms(raw, targetHangul) {
  const value = String(raw ?? "");
  const target = compactHangul(targetHangul);
  if (!target || !/[\u4E00-\u9FFF]/u.test(value)) return [];

  const forms = [];
  const pairPattern = /([\uAC00-\uD7AF0-9][\uAC00-\uD7AF0-9\s^·-]*?)\(([\u4E00-\u9FFF0-9\s^·-]+)\)/gu;
  for (const match of value.matchAll(pairPattern)) {
    const hangulBase = compactHangul(match[1]);
    const hanjaBase = projectReadingStructure(match[2], match[1]);
    if (!hangulBase || !hanjaBase) continue;

    if (target === hangulBase) {
      forms.push(hanjaBase);
      continue;
    }

    if (target.startsWith(hangulBase)) {
      forms.push(`${hanjaBase}${readingSuffixAfterUnits(targetHangul, Array.from(hangulBase).length)}`);
    }
  }

  return uniqueValues(forms);
}

function collectEtymologyHanjaForms(entry, hangul) {
  const forms = [];
  for (const template of entry.etymology_templates ?? []) {
    for (const value of Object.values(template.args ?? {})) {
      forms.push(...normalizeScriptForms(value, hangul));
    }
    forms.push(...normalizeScriptForms(template.expansion, hangul));
  }
  forms.push(...normalizeScriptForms(entry.etymology_text, hangul));
  return uniqueValues(forms);
}

function extractHanjaFormsFromWiktionaryEntry(entry, hangul, hanjaReadings) {
  if (!entry || entry.lang_code !== "ko") return [];

  const wordForms = normalizeScriptForms(entry.word, hangul);
  if (wordForms.length > 0) return filterReadableScriptForms(wordForms, hangul, hanjaReadings);

  const headTemplateForms = [];
  for (const template of entry.head_templates ?? []) {
    headTemplateForms.push(...normalizeScriptForms(template.args?.hanja, hangul));
  }
  if (headTemplateForms.length > 0) return filterReadableScriptForms(headTemplateForms, hangul, hanjaReadings);

  const taggedForms = [];
  for (const form of entry.forms ?? []) {
    if (form.tags?.includes("hanja")) {
      taggedForms.push(...normalizeScriptForms(form.form, hangul));
    }
  }
  if (taggedForms.length > 0) return filterReadableScriptForms(taggedForms, hangul, hanjaReadings);

  const etymologyForms = [];
  for (const template of entry.etymology_templates ?? []) {
    if (template.name?.toLowerCase() === "ko-etym-sino") {
      for (const value of Object.values(template.args ?? {})) {
        etymologyForms.push(...normalizeScriptForms(value, hangul));
      }
    }
  }
  if (etymologyForms.length > 0) return filterReadableScriptForms(etymologyForms, hangul, hanjaReadings);

  if (!allowsLooseEtymologyMining(entry, hangul)) return [];
  return filterReadableScriptForms(collectEtymologyHanjaForms(entry, hangul), hangul, hanjaReadings);
}

function hangulFromWiktionaryEntry(entry) {
  if (/[\uAC00-\uD7AF]/u.test(entry.word ?? "")) return entry.word;
  for (const form of entry.forms ?? []) {
    if (form.tags?.includes("hangeul") && /[\uAC00-\uD7AF]/u.test(form.form)) {
      return form.form;
    }
  }
  for (const sense of entry.senses ?? []) {
    for (const form of sense.form_of ?? []) {
      if (/[\uAC00-\uD7AF]/u.test(form.word ?? "")) return form.word;
    }
  }
  return "";
}

function structuralGlossHeading(gloss) {
  const text = compactWhitespace(gloss);
  if (!text.endsWith(":")) return "";
  return compactWhitespace(text.replace(/[:：]+$/u, ""));
}

function splitQualifierParts(text) {
  return text
    .split(",")
    .map((part) => compactWhitespace(part))
    .filter(Boolean);
}

function publicGlossDiscriminator(rawGloss, normalizedGloss) {
  const raw = compactWhitespace(rawGloss);
  if (!raw.startsWith("(")) return undefined;

  const qualifiers = [];
  let rest = raw;
  while (rest.startsWith("(")) {
    const end = rest.indexOf(")");
    if (end <= 0) break;
    qualifiers.push(rest.slice(1, end));
    rest = compactWhitespace(rest.slice(end + 1));
  }

  if (!qualifiers.length || rest !== compactWhitespace(normalizedGloss)) return undefined;

  const lexicalQualifiers = qualifiers
    .flatMap(splitQualifierParts)
    .filter((part) => {
      const normalized = part.toLowerCase();
      if (["transitive", "intransitive", "auxiliary", "colloquial", "euphemistic", "often", "polite", "usually"].includes(normalized)) {
        return false;
      }
      return /^(after|as|by|from|in|of|used|whether|with)\b/u.test(normalized) || normalized.includes(" as ") || normalized.includes(" with ");
    });

  return lexicalQualifiers.length ? lexicalQualifiers.join("; ") : undefined;
}

async function loadWiktionaryAlignedEntries(limit, hanjaReadings, hunmongJahoeReadings = []) {
  const dictPath = path.join(root, "app", "data", "dict.json");
  if (!existsSync(dictPath)) return [];

  const chunks = [];
  await new Promise((resolve, reject) => {
    createReadStream(dictPath, { encoding: "utf8" })
      .on("data", (chunk) => chunks.push(chunk))
      .on("end", resolve)
      .on("error", reject);
  });

  const parsed = JSON.parse(chunks.join(""));
  const hanjaMiddleKoreanIndex = buildMiddleKoreanHanjaIndex(parsed, hunmongJahoeReadings);
  const results = [];
  for (const entry of parsed) {
    if (Number.isFinite(limit) && results.length >= limit) break;
    if (entry.lang_code !== "ko" || entry.pos === "character" || entry.pos === "syllable") continue;
    const hangul = hangulFromWiktionaryEntry(entry);
    if (!hangul) continue;
    const hanjaForms = extractHanjaFormsFromWiktionaryEntry(entry, hangul, hanjaReadings);
    const hanja = hanjaForms[0] ?? "";
    const definitions = [];
    for (const sense of entry.senses ?? []) {
      const glosses = sense.glosses ?? [];
      const groupLabel = glosses.length > 1 ? structuralGlossHeading(glosses[0]) : "";
      for (const [glossIndex, gloss] of glosses.entries()) {
        if (gloss.startsWith("hanja form of")) continue;
        if (MIXED_SCRIPT_FORM_OF_PATTERN.test(gloss)) continue;
        if (gloss.includes("MC reading:") || gloss.startsWith("More information")) continue;
        if (groupLabel && glossIndex === 0) continue;
        const rawGloss = sense.raw_glosses?.[glossIndex];
        definitions.push({
          text: gloss,
          pos: normalizePos(entry.pos),
          examples: (sense.examples ?? []).map((example) => example.text).filter(Boolean),
          tags: sense.tags ?? [],
          senseGroup: groupLabel ? { label: groupLabel } : undefined,
          discriminator: rawGloss ? publicGlossDiscriminator(rawGloss, gloss) : undefined,
          sourceIds: [`wiktionary:${sense.id ?? entry.word}`],
          confidence: 0.86,
        });
      }
    }
    if (definitions.length === 0) continue;
    const hasExplicitHanja = hanja && /[\u4E00-\u9FFF]/u.test(hanja);
    const middleKorean = mergeMiddleKoreanForms(
      extractTemplateMiddleKoreanForms(entry),
      hasExplicitHanja ? composeMiddleKoreanHanjaTerm(hanja, hangul, hanjaMiddleKoreanIndex) : [],
    );
    results.push({
      id: `wiktionary:${hangul}:${hasExplicitHanja ? hanja : "hangul-only"}:${results.length}`,
      hangul,
      hanja: hasExplicitHanja ? hanja : hangul,
      alternateHanja: hasExplicitHanja ? hanjaForms.slice(1) : [],
      middleKorean: middleKorean.length ? middleKorean.slice(0, 3) : undefined,
      definitions: definitions.map((definition) => ({
        ...definition,
        confidence: hasExplicitHanja ? definition.confidence : 0.55,
      })),
      provenance: ["wiktionary"],
      confidence: hasExplicitHanja ? 0.86 : 0.55,
      reviewStatus: hasExplicitHanja ? "trusted-source" : "hangul-only",
    });
  }
  return results;
}

function applyReviewedDecisions(lexicon, reviewed) {
  const byId = new Map(lexicon.map((entry) => [entry.id, entry]));
  for (const decision of reviewed) {
    if (decision.action === "approve" && decision.entry) {
      byId.set(decision.entry.id, {
        ...decision.entry,
        reviewStatus: "reviewed",
        confidence: 1,
      });
    }
    if (decision.action === "reject" && decision.entryId) {
      byId.delete(decision.entryId);
    }
  }
  return Array.from(byId.values());
}

function alignSeedSources(koSenses, englishEntries) {
  const lexicon = [];
  const reviewQueue = [];
  const koGroups = groupBy(koSenses, (sense) => sense.hangul);

  for (const enEntry of englishEntries) {
    const candidates = koGroups.get(enEntry.hangul) ?? [];
    for (const gloss of enEntry.glosses ?? []) {
      const scored = candidates
        .map((koSense) => ({
          koSense,
          gloss,
          score: scorePair(koSense, gloss, enEntry),
        }))
        .sort((left, right) => right.score - left.score);

      const best = scored[0];
      const runnerUp = scored[1];
      if (!best) continue;

      const entry = {
        id: `aligned:${enEntry.hangul}:${best.koSense.hanja}:${encodeURIComponent(gloss)}`,
        hangul: enEntry.hangul,
        hanja: best.koSense.hanja,
        definitions: [
          {
            text: gloss,
            pos: normalizePos(enEntry.pos),
            examples: enEntry.examples ?? [],
            tags: [...(best.koSense.tags ?? []), ...(enEntry.tags ?? [])],
            sourceIds: [best.koSense.sourceId, enEntry.sourceId].filter(Boolean),
            confidence: Number(best.score.toFixed(3)),
          },
        ],
        provenance: [best.koSense.sourceId, enEntry.sourceId].filter(Boolean),
        confidence: Number(best.score.toFixed(3)),
        reviewStatus:
          best.score >= 0.72 && (!runnerUp || best.score - runnerUp.score >= 0.14)
            ? "auto-aligned"
            : "needs-review",
      };

      if (entry.reviewStatus === "needs-review") {
        reviewQueue.push({
          id: `review:${enEntry.hangul}:${encodeURIComponent(gloss)}`,
          hangul: enEntry.hangul,
          englishGloss: gloss,
          englishSourceId: enEntry.sourceId,
          candidates: scored.slice(0, 6).map((candidate) => ({
            hanja: candidate.koSense.hanja,
            koDefinition: candidate.koSense.koDefinition,
            enDefinitionHint: candidate.koSense.enDefinitionHint,
            pos: normalizePos(candidate.koSense.pos),
            domains: candidate.koSense.domains ?? [],
            score: Number(candidate.score.toFixed(3)),
            sourceId: candidate.koSense.sourceId,
          })),
        });
      }

      lexicon.push(entry);
    }
  }

  return { lexicon, reviewQueue };
}

function mergeDuplicateEntries(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = `${entry.hangul}\u0000${entry.hanja}`;
    const existing = byKey.get(key);
    if (!existing) {
      const merged = {
        ...entry,
        definitions: [...entry.definitions],
        alternateHanja: [...new Set(entry.alternateHanja ?? [])],
        alternateForms: [...(entry.alternateForms ?? [])],
        provenance: [...new Set(entry.provenance ?? [])],
      };
      if (entry.middleKorean?.length) merged.middleKorean = [...entry.middleKorean];
      byKey.set(key, merged);
      continue;
    }
    existing.definitions.push(...entry.definitions);
    existing.alternateHanja = [...new Set([...(existing.alternateHanja ?? []), ...(entry.alternateHanja ?? [])])];
    existing.alternateForms = mergeAlternateForms(existing.alternateForms ?? [], entry.alternateForms ?? []);
    existing.middleKorean = mergeMiddleKoreanForms(existing.middleKorean ?? [], entry.middleKorean ?? []).slice(0, 3);
    if (!existing.middleKorean.length) delete existing.middleKorean;
    existing.provenance = [...new Set([...(existing.provenance ?? []), ...(entry.provenance ?? [])])];
    existing.confidence = Math.max(existing.confidence ?? 0, entry.confidence ?? 0);
    if (entry.reviewStatus === "reviewed") existing.reviewStatus = "reviewed";
  }
  return Array.from(byKey.values()).sort((left, right) => {
    const hangul = left.hangul.localeCompare(right.hangul, "ko");
    if (hangul !== 0) return hangul;
    return String(left.hanja).localeCompare(String(right.hanja), "ko");
  });
}

function mergeAlternateForms(left, right) {
  const byKey = new Map();
  for (const form of [...left, ...right]) {
    const key = `${form.form}\u0000${form.reading ?? ""}\u0000${form.label ?? ""}`;
    byKey.set(key, form);
  }
  return Array.from(byKey.values());
}

const NORTH_KOREA_REDIRECT_PATTERN = /^North Korea standard (?:form|spelling) of\s+(.+?)(?:[.。]|$)/;

function parseNorthKoreanRedirectTarget(text) {
  const match = String(text ?? "").match(NORTH_KOREA_REDIRECT_PATTERN);
  if (!match) return null;

  const body = match[1].trim();
  const targetSegment = body.replace(/\s+\(.+$/, "").trim();
  const hanjaAnnotated = targetSegment.match(/^(.+?)\s*\(([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+)\)$/u);
  return {
    hangul: (hanjaAnnotated?.[1] ?? targetSegment).trim(),
    hanja: hanjaAnnotated?.[2]?.trim() ?? "",
    fallbackGloss: body.match(/[“"]([^”"]+)[”"]/)?.[1]?.trim() ?? "",
  };
}

function getNorthKoreanTarget(definitions) {
  for (const definition of definitions ?? []) {
    const target = parseNorthKoreanRedirectTarget(definition.text);
    if (target?.hangul) return target;
  }
  return null;
}

function isRedirectDefinition(definition) {
  return NORTH_KOREA_REDIRECT_PATTERN.test(definition.text);
}

function getAlternativeHanjaTarget(definitions) {
  for (const definition of definitions ?? []) {
    const match = definition.text.match(/^Alternative form of\s+([\u4E00-\u9FFF]+)/u);
    if (!match) continue;
    return match[1];
  }
  return "";
}

function isAlternativeHanjaRedirect(definition) {
  return /^Alternative form of\s+[\u4E00-\u9FFF]+/u.test(definition.text);
}

function mergeNorthKoreanSpellingVariants(entries) {
  const byHangul = groupBy(entries, (entry) => entry.hangul);
  const removed = new Set();
  const additions = [];

  for (const entry of entries) {
    const target = getNorthKoreanTarget(entry.definitions);
    if (!target || target.hangul === entry.hangul) continue;

    const candidates = byHangul.get(target.hangul) ?? [];
    const targetEntry =
      candidates.find((candidate) => candidate.hanja === (target.hanja || entry.hanja)) ??
      candidates.find((candidate) => candidate.hanja === entry.hanja) ??
      candidates.find((candidate) => target.hanja && candidate.alternateHanja?.includes(target.hanja)) ??
      candidates[0];

    const alternate = {
      form: entry.hanja && entry.hanja !== entry.hangul ? entry.hanja : entry.hangul,
      reading: entry.hangul,
      label: DUEUM_CANONICAL_LABEL,
    };

    if (targetEntry) {
      targetEntry.alternateForms = mergeAlternateForms(targetEntry.alternateForms ?? [], [alternate]);
      targetEntry.provenance = [...new Set([...(targetEntry.provenance ?? []), ...(entry.provenance ?? [])])];

      const transferableDefinitions = entry.definitions.filter((definition) => !isRedirectDefinition(definition));
      if (transferableDefinitions.length > 0) {
        targetEntry.definitions.push(...transferableDefinitions);
      }

      removed.add(entry.id);
      continue;
    }

    const redirectDefinitions = entry.definitions.filter(isRedirectDefinition);
    const convertedDefinitions = redirectDefinitions
      .map((definition) => {
        const redirectTarget = parseNorthKoreanRedirectTarget(definition.text);
        if (!redirectTarget?.fallbackGloss) return null;
        return {
          ...definition,
          text: redirectTarget.fallbackGloss,
          tags: (definition.tags ?? []).filter((tag) => tag !== "North-Korea"),
        };
      })
      .filter(Boolean);
    if (!convertedDefinitions.length) continue;

    additions.push({
      ...entry,
      id: `${entry.id}:north-korean-target:${target.hangul}:${target.hanja || entry.hanja}`,
      hangul: target.hangul,
      hanja: target.hanja || (entry.hanja === entry.hangul ? target.hangul : entry.hanja),
      definitions: convertedDefinitions,
      alternateForms: mergeAlternateForms(entry.alternateForms ?? [], [alternate]),
    });

    const remainingDefinitions = entry.definitions.filter((definition) => !isRedirectDefinition(definition));
    if (remainingDefinitions.length) {
      entry.definitions = remainingDefinitions;
    } else {
      removed.add(entry.id);
    }
  }

  return [...entries.filter((entry) => !removed.has(entry.id)), ...additions];
}

function mergeAlternativeHanjaForms(entries) {
  const byHangul = groupBy(entries, (entry) => entry.hangul);
  const removed = new Set();

  for (const entry of entries) {
    const targetHanja = getAlternativeHanjaTarget(entry.definitions);
    if (!targetHanja || targetHanja === entry.hanja) continue;

    const candidates = byHangul.get(entry.hangul) ?? [];
    const targetEntry = candidates.find((candidate) => candidate.hanja === targetHanja);
    if (!targetEntry) continue;

    targetEntry.alternateForms = mergeAlternateForms(targetEntry.alternateForms ?? [], [
      {
        form: entry.hanja,
        reading: entry.hangul,
        label: "Alternative form",
      },
    ]);
    targetEntry.alternateHanja = uniqueValues([...(targetEntry.alternateHanja ?? []), entry.hanja]);
    targetEntry.provenance = uniqueValues([...(targetEntry.provenance ?? []), ...(entry.provenance ?? [])]);

    const transferableDefinitions = entry.definitions.filter((definition) => !isAlternativeHanjaRedirect(definition));
    if (transferableDefinitions.length > 0) targetEntry.definitions.push(...transferableDefinitions);
    removed.add(entry.id);
  }

  return entries.filter((entry) => !removed.has(entry.id));
}

function hangulParts(syllable) {
  const code = String(syllable ?? "").codePointAt(0);
  if (!code || code < 0xac00 || code > 0xd7a3) return null;
  const offset = code - 0xac00;
  return {
    choseong: Math.floor(offset / 588),
    jungseong: Math.floor((offset % 588) / 28),
    jongseong: offset % 28,
  };
}

function composeHangul({ choseong, jungseong, jongseong }) {
  return String.fromCodePoint(0xac00 + choseong * 588 + jungseong * 28 + jongseong);
}

function southKoreanDueumSyllable(canonicalSyllable) {
  const parts = hangulParts(canonicalSyllable);
  if (!parts) return "";

  if (parts.choseong === 5) {
    return composeHangul({
      ...parts,
      choseong: DUEUM_IOTIZED_JUNG_INDEXES.has(parts.jungseong) ? 11 : 2,
    });
  }

  if (parts.choseong === 2 && DUEUM_IOTIZED_JUNG_INDEXES.has(parts.jungseong)) {
    return composeHangul({
      ...parts,
      choseong: 11,
    });
  }

  return "";
}

function structuralUnits(value) {
  return Array.from(String(value ?? ""))
    .map((char, index) => ({ char, index }))
    .filter((unit) => isStructuralScriptUnit(unit.char));
}

function replaceStructuralUnit(value, structuralIndex, replacement) {
  const chars = Array.from(String(value ?? ""));
  let seen = -1;
  for (let index = 0; index < chars.length; index += 1) {
    if (!isStructuralScriptUnit(chars[index])) continue;
    seen += 1;
    if (seen !== structuralIndex) continue;
    chars[index] = replacement;
    break;
  }
  return chars.join("");
}

function dueumReadingsForEntry(entry, hanjaReadings, mode) {
  if (!entry?.hangul || !entry?.hanja || entry.hanja === entry.hangul) return "";
  if (entry.hangul.includes("-")) return "";
  if (!scriptFormMatchesReading(entry.hanja, entry.hangul, hanjaReadings)) return "";

  const scriptUnits = structuralUnits(entry.hanja);
  const readingUnits = structuralUnits(entry.hangul);
  if (scriptUnits.length !== readingUnits.length) return "";

  let output = entry.hangul;
  for (let index = 0; index < scriptUnits.length; index += 1) {
    const scriptUnit = scriptUnits[index].char;
    const readingUnit = structuralUnits(output)[index]?.char ?? readingUnits[index].char;
    if (!isHanja(scriptUnit) || !/[\uAC00-\uD7AF]/u.test(readingUnit)) continue;

    const canonicalReadings = Array.from(hanjaReadings.get(scriptUnit) ?? [])
      .filter((reading) => Array.from(reading).length === 1)
      .filter((reading) => {
        const parts = hangulParts(reading);
        return parts && (parts.choseong === 5 || parts.choseong === 2);
      })
      .sort((left, right) => {
        const leftParts = hangulParts(left);
        const rightParts = hangulParts(right);
        return (rightParts?.choseong ?? 0) - (leftParts?.choseong ?? 0);
      });

    if (mode === "canonical") {
      const canonical = canonicalReadings.find((reading) => southKoreanDueumSyllable(reading) === readingUnit);
      if (canonical && canonical !== readingUnit) output = replaceStructuralUnit(output, index, canonical);
      continue;
    }

    const south = canonicalReadings
      .filter((reading) => reading === readingUnit)
      .map(southKoreanDueumSyllable)
      .find((reading) => reading && reading !== readingUnit);
    if (south) output = replaceStructuralUnit(output, index, south);
  }

  return output === entry.hangul ? "" : output;
}

function canonicalDueumReadingForEntry(entry, hanjaReadings) {
  return dueumReadingsForEntry(entry, hanjaReadings, "canonical");
}

function mergeDueumAlternateForm(existingForms, generated) {
  const filtered = (existingForms ?? []).filter(
    (form) => !(form.form === generated.form && form.reading === generated.reading),
  );
  return mergeAlternateForms(filtered, [generated]);
}

function southDueumReadingForCanonicalEntry(entry, hanjaReadings) {
  return dueumReadingsForEntry(entry, hanjaReadings, "south");
}

function mergeCanonicalDueumEntries(entries, hanjaReadings) {
  const byHangul = groupBy(entries, (entry) => entry.hangul);
  const removed = new Set();
  let mergedEntries = 0;

  for (const entry of entries) {
    const southReading = southDueumReadingForCanonicalEntry(entry, hanjaReadings);
    if (!southReading || southReading === entry.hangul) continue;

    const targetEntry =
      (byHangul.get(southReading) ?? []).find((candidate) => candidate.hanja === entry.hanja) ??
      (byHangul.get(southReading) ?? []).find((candidate) => candidate.alternateHanja?.includes(entry.hanja));
    if (!targetEntry || targetEntry.id === entry.id) continue;

    targetEntry.alternateForms = mergeDueumAlternateForm(targetEntry.alternateForms, {
      form: entry.hanja,
      reading: entry.hangul,
      label: DUEUM_CANONICAL_LABEL,
    });
    targetEntry.provenance = uniqueValues([...(targetEntry.provenance ?? []), ...(entry.provenance ?? [])]);
    targetEntry.confidence = Math.max(targetEntry.confidence ?? 0, entry.confidence ?? 0);
    removed.add(entry.id);
    mergedEntries += 1;
  }

  return {
    entries: entries.filter((entry) => !removed.has(entry.id)),
    stats: {
      mergedEntries,
    },
  };
}

function addCanonicalDueumAlternates(entries, hanjaReadings) {
  let generated = 0;
  const output = entries.map((entry) => {
    const reading = canonicalDueumReadingForEntry(entry, hanjaReadings);
    if (!reading || reading === entry.hangul) return entry;

    generated += 1;
    return {
      ...entry,
      alternateForms: mergeDueumAlternateForm(entry.alternateForms, {
        form: entry.hanja,
        reading,
        label: DUEUM_CANONICAL_LABEL,
      }),
    };
  });

  return {
    entries: output,
    stats: {
      generatedAlternates: generated,
    },
  };
}

function entryText(entry) {
  return (entry.definitions ?? [])
    .flatMap((definition) => [
      definition.text,
      ...(definition.examples ?? []),
      ...(definition.tags ?? []),
      ...(definition.pos ?? []),
    ])
    .join(" ");
}

function definitionText(definition) {
  return [
    definition.text,
    ...(definition.examples ?? []),
    ...(definition.tags ?? []),
    ...(definition.pos ?? []),
  ].join(" ");
}

function isHangulOnlyEntry(entry) {
  return entry.hangul && entry.hanja === entry.hangul && /[\uAC00-\uD7AF]/u.test(entry.hangul);
}

function isUsableHanjaBase(entry, hanjaReadings) {
  return (
    entry.hangul &&
    entry.hanja &&
    entry.hanja !== entry.hangul &&
    scriptFormMatchesReading(entry.hanja, entry.hangul, hanjaReadings)
  );
}

function derivedRulesForHangul(hangul) {
  return DERIVED_SUFFIX_RULES.map((rule) => ({
    ...rule,
    baseHangul: hangul.endsWith(rule.suffix) ? hangul.slice(0, -rule.suffix.length) : "",
  })).filter((rule) => rule.baseHangul.length > 0);
}

function derivedCandidates(entry, baseEntriesByHangul, hanjaReadings) {
  const candidates = [];
  for (const rule of derivedRulesForHangul(entry.hangul)) {
    const bases = (baseEntriesByHangul.get(rule.baseHangul) ?? []).filter((base) =>
      isUsableHanjaBase(base, hanjaReadings),
    );

    for (const base of bases) {
      const hanja = `${base.hanja}${rule.hanjaSuffix}`;
      if (!scriptFormMatchesReading(hanja, entry.hangul, hanjaReadings)) continue;
      candidates.push({
        hanja,
        base,
        rule,
      });
    }
  }

  const byHanja = new Map();
  for (const candidate of candidates) {
    if (!byHanja.has(candidate.hanja)) byHanja.set(candidate.hanja, candidate);
  }
  return Array.from(byHanja.values());
}

function scoreDerivedCandidate(candidate, definition, sourceEntry) {
  const targetTokens = tokenize(definitionText(definition));
  const baseTokens = tokenize(entryText(candidate.base));
  const lexical = jaccard(baseTokens, targetTokens);
  const character = hanjaSemanticScore(candidate.base.hanja, definition.text);
  const pos = posScore(candidate.base.definitions?.flatMap((item) => item.pos ?? []), definition.pos);
  const sourceConfidence = candidate.base.confidence ?? 0.5;
  const singleDefinitionBoost = sourceEntry.definitions?.length === 1 ? 0.08 : 0;

  return Number(
    (
      0.42 * lexical +
      0.24 * character +
      0.16 * pos +
      0.1 * sourceConfidence +
      singleDefinitionBoost
    ).toFixed(3),
  );
}

function withDerivedDefinitionMetadata(definition, candidate, score) {
  return {
    ...definition,
    tags: uniqueValues([...(definition.tags ?? []), "derived-hanja", candidate.rule.label]),
    sourceIds: uniqueValues([
      ...(definition.sourceIds ?? []),
      `derived:${candidate.base.id}:${candidate.rule.suffix}`,
    ]),
    confidence: Math.max(definition.confidence ?? 0, score),
  };
}

function inferDerivedHanja(entries, hanjaReadings) {
  const baseEntriesByHangul = groupBy(
    entries.filter((entry) => isUsableHanjaBase(entry, hanjaReadings)),
    (entry) => entry.hangul,
  );
  const output = [];
  const reviewQueue = [];
  const stats = {
    hangulOnlyBefore: 0,
    derivableEntries: 0,
    inferredDefinitions: 0,
    ambiguousDefinitions: 0,
    unresolvedDerivableEntries: 0,
  };

  for (const entry of entries) {
    if (!isHangulOnlyEntry(entry)) {
      output.push(entry);
      continue;
    }

    stats.hangulOnlyBefore += 1;
    const candidates = derivedCandidates(entry, baseEntriesByHangul, hanjaReadings);
    if (candidates.length === 0) {
      output.push(entry);
      continue;
    }

    stats.derivableEntries += 1;
    const remainingDefinitions = [];

    for (const definition of entry.definitions ?? []) {
      const scored = candidates
        .map((candidate) => ({
          ...candidate,
          score: candidates.length === 1 ? Math.max(0.78, scoreDerivedCandidate(candidate, definition, entry)) : scoreDerivedCandidate(candidate, definition, entry),
        }))
        .sort((left, right) => right.score - left.score);

      const best = scored[0];
      const runnerUp = scored[1];
      const confident =
        best &&
        (candidates.length === 1 || (best.score >= 0.42 && (!runnerUp || best.score - runnerUp.score >= 0.16)));

      if (confident) {
        stats.inferredDefinitions += 1;
        output.push({
          ...entry,
          id: `derived:${entry.hangul}:${best.hanja}:${encodeURIComponent(definition.text)}`,
          hanja: best.hanja,
          definitions: [withDerivedDefinitionMetadata(definition, best, best.score)],
          provenance: uniqueValues([...(entry.provenance ?? []), ...(best.base.provenance ?? []), "derived-hanja"]),
          confidence: Math.max(entry.confidence ?? 0, best.score),
          reviewStatus: candidates.length === 1 ? "derived-hanja" : "auto-derived-hanja",
          alternateHanja: [],
          alternateForms: entry.alternateForms ?? [],
        });
        continue;
      }

      stats.ambiguousDefinitions += 1;
      remainingDefinitions.push(definition);
      reviewQueue.push({
        id: `review-derived:${entry.hangul}:${encodeURIComponent(definition.text)}`,
        hangul: entry.hangul,
        englishGloss: definition.text,
        englishSourceId: definition.sourceIds?.[0] ?? entry.id,
        candidates: scored.slice(0, 8).map((candidate) => ({
          hanja: candidate.hanja,
          koDefinition: candidate.base.definitions?.map((item) => item.text).join("; ") ?? "",
          enDefinitionHint: candidate.base.definitions?.[0]?.text ?? "",
          pos: normalizePos(definition.pos),
          domains: [],
          score: candidate.score,
          sourceId: candidate.base.id,
        })),
      });
    }

    if (remainingDefinitions.length > 0) {
      stats.unresolvedDerivableEntries += 1;
      output.push({
        ...entry,
        definitions: remainingDefinitions,
        reviewStatus: "needs-derived-hanja-review",
      });
    }
  }

  const hangulOnlyAfter = output.filter(isHangulOnlyEntry).length;
  return {
    entries: output,
    reviewQueue,
    stats: {
      ...stats,
      hangulOnlyAfter,
      hangulOnlyReducedBy: stats.hangulOnlyBefore - hangulOnlyAfter,
    },
  };
}

function productiveFormTag(rule, definition) {
  const pos = new Set(normalizePos(definition.pos));
  if (rule.suffix === "히") return "hi-adv";
  if (rule.suffix === "하다" && pos.has("Adjective")) return "hada-adjective";
  if (rule.suffix === "하다" && pos.has("Verb")) return "hada-verb";
  if (rule.suffix === "하다") return "hada-form";
  return `${rule.suffix}-form`;
}

function isRootPlaceholderDefinition(definition) {
  return (
    /^Root of\s+/u.test(definition.text) &&
    (definition.tags ?? []).some((tag) => ["morpheme", "root"].includes(String(tag).toLowerCase()))
  );
}

function productiveBaseForEntry(entry, hanjaReadings) {
  for (const rule of PRODUCTIVE_FORM_FOLDING_RULES) {
    if (!entry.hangul.endsWith(rule.suffix) || !entry.hanja.endsWith(rule.hanjaSuffix)) continue;
    const baseHangul = entry.hangul.slice(0, -rule.suffix.length);
    const baseHanja = entry.hanja.slice(0, -rule.hanjaSuffix.length);
    if (!baseHangul || !baseHanja || baseHangul === entry.hangul || baseHanja === entry.hanja) continue;
    if (!scriptFormMatchesReading(baseHanja, baseHangul, hanjaReadings)) continue;
    return { ...rule, baseHangul, baseHanja };
  }
  return null;
}

function foldProductiveFormsIntoRoots(entries, hanjaReadings) {
  const byKey = new Map(entries.map((entry) => [`${entry.hangul}\u0000${entry.hanja}`, entry]));
  const removed = new Set();
  const stats = {
    foldedEntries: 0,
    foldedDefinitions: 0,
  };

  for (const entry of entries) {
    const rule = productiveBaseForEntry(entry, hanjaReadings);
    if (!rule) continue;

    const root = byKey.get(`${rule.baseHangul}\u0000${rule.baseHanja}`);
    if (!root) continue;

    root.definitions = [
      ...(root.definitions ?? []).filter((definition) => !isRootPlaceholderDefinition(definition)),
      ...(entry.definitions ?? []).map((definition) => ({
        ...definition,
        pos: normalizePos(definition.pos),
        tags: uniqueValues([productiveFormTag(rule, definition), ...(definition.tags ?? [])]),
        formOf: {
          form: entry.hanja,
          reading: entry.hangul,
          label: rule.alternateLabel,
        },
      })),
    ];
    root.searchForms = mergeAlternateForms(root.searchForms ?? [], [
      {
        form: entry.hanja,
        reading: entry.hangul,
        label: rule.alternateLabel,
      },
    ]);
    root.provenance = uniqueValues([...(root.provenance ?? []), ...(entry.provenance ?? [])]);
    root.confidence = Math.max(root.confidence ?? 0, entry.confidence ?? 0);

    stats.foldedEntries += 1;
    stats.foldedDefinitions += entry.definitions?.length ?? 0;
    removed.add(entry.id);
  }

  return {
    entries: entries.filter((entry) => !removed.has(entry.id)),
    stats,
  };
}

function structuralIntegrityReport(entries) {
  const issues = {
    affixMarkerMissing: [],
    digitMissing: [],
    spaceMissing: [],
  };

  for (const entry of entries) {
    if (!entry.hanja || entry.hanja === entry.hangul || !/[\u4E00-\u9FFF]/u.test(entry.hanja)) continue;

    if ((entry.hangul.startsWith("-") && !entry.hanja.startsWith("-")) || (entry.hangul.endsWith("-") && !entry.hanja.endsWith("-"))) {
      issues.affixMarkerMissing.push({ hangul: entry.hangul, hanja: entry.hanja, id: entry.id });
    }
    if (/[0-9]/u.test(entry.hangul) && !/[0-9]/u.test(entry.hanja)) {
      issues.digitMissing.push({ hangul: entry.hangul, hanja: entry.hanja, id: entry.id });
    }
    if (/\s/u.test(entry.hangul) && !/\s/u.test(entry.hanja)) {
      issues.spaceMissing.push({ hangul: entry.hangul, hanja: entry.hanja, id: entry.id });
    }
  }

  return {
    affixMarkerMissing: issues.affixMarkerMissing.length,
    digitMissing: issues.digitMissing.length,
    spaceMissing: issues.spaceMissing.length,
    samples: {
      affixMarkerMissing: issues.affixMarkerMissing.slice(0, 10),
      digitMissing: issues.digitMissing.slice(0, 10),
      spaceMissing: issues.spaceMissing.slice(0, 10),
    },
  };
}

function assertStructuralIntegrity(report) {
  const issueCount = report.affixMarkerMissing + report.digitMissing + report.spaceMissing;
  if (issueCount === 0) return;

  throw new Error(
    `Structured Hanja integrity failed: ${JSON.stringify(report.samples, null, 2)}`,
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const includeWiktionary = args.has("--include-wiktionary");
  const wiktionaryLimitArg = process.argv.find((arg) => arg.startsWith("--wiktionary-limit="));
  const wiktionaryLimitValue = wiktionaryLimitArg?.split("=")[1];
  const wiktionaryLimit =
    wiktionaryLimitValue && wiktionaryLimitValue !== "all"
      ? Number(wiktionaryLimitValue)
      : Infinity;

  await mkdir(generatedDir, { recursive: true });
  const hanjaReadings = await loadHanjaReadings();
  const hunmongJahoe = await loadHunmongJahoeMiddleKoreanReadings();
  const {
    koSenses,
    englishEntries,
    lexiconEntries,
    reviewed,
    manifest: sourceManifest,
  } = await loadNormalizedSources({ root, sourceDir, decisionsPath });
  const aligned = alignSeedSources(koSenses, englishEntries);
  const wiktionary = includeWiktionary ? await loadWiktionaryAlignedEntries(wiktionaryLimit, hanjaReadings, hunmongJahoe.readings) : [];
  const derived = inferDerivedHanja(
    mergeAlternativeHanjaForms(mergeNorthKoreanSpellingVariants(mergeDuplicateEntries([...aligned.lexicon, ...lexiconEntries, ...wiktionary]))),
    hanjaReadings,
  );
  const folded = foldProductiveFormsIntoRoots(mergeDuplicateEntries(derived.entries), hanjaReadings);
  const dueumMerged = mergeCanonicalDueumEntries(
    applyReviewedDecisions(mergeDuplicateEntries(folded.entries), reviewed),
    hanjaReadings,
  );
  const dueum = addCanonicalDueumAlternates(dueumMerged.entries, hanjaReadings);
  const lexicon = dueum.entries;
  const structuralIntegrity = structuralIntegrityReport(lexicon);
  assertStructuralIntegrity(structuralIntegrity);
  const reviewItems = [...aligned.reviewQueue, ...derived.reviewQueue];

  const metadata = {
    builtAt: new Date().toISOString(),
    sourceContractVersion: SOURCE_CONTRACT_VERSION,
    sources: {
      files: sourceManifest.files,
      koSenseCount: koSenses.length,
      englishEntryCount: englishEntries.length,
      lexiconEntryCount: lexiconEntries.length,
      hanjaReadingCount: hanjaReadings.size,
      hunmongJahoeReadingCount: hunmongJahoe.readings.length,
      hunmongJahoeSourceUrl: hunmongJahoe.metadata?.sourceUrl ?? null,
      reviewedDecisionCount: reviewed.length,
      wiktionaryIncluded: includeWiktionary,
      wiktionaryEntryLimit: includeWiktionary
        ? Number.isFinite(wiktionaryLimit)
          ? wiktionaryLimit
          : "all"
        : 0,
    },
    derivedHanja: derived.stats,
    dueumCanonicalAlternates: {
      ...dueumMerged.stats,
      ...dueum.stats,
    },
    productiveForms: folded.stats,
    structuralIntegrity,
  };

  await writeFile(lexiconPath, `${JSON.stringify({ metadata, entries: lexicon }, null, 2)}\n`);
  await writeFile(reviewQueuePath, `${JSON.stringify({ metadata, items: reviewItems }, null, 2)}\n`);
  await writeFile(
    coverageReportPath,
    `${JSON.stringify(
      {
        metadata,
        unresolvedHangulOnlySamples: lexicon
          .filter(isHangulOnlyEntry)
          .slice(0, 200)
          .map((entry) => ({
            hangul: entry.hangul,
            definition: entry.definitions?.[0]?.text ?? "",
            reviewStatus: entry.reviewStatus,
          })),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${lexicon.length} lexicon entries to ${path.relative(root, lexiconPath)}`);
  console.log(`Wrote ${reviewItems.length} review items to ${path.relative(root, reviewQueuePath)}`);
  console.log(`Wrote Hanja coverage report to ${path.relative(root, coverageReportPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
