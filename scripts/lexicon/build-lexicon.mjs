#!/usr/bin/env node

import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const generatedDir = path.join(root, "app", "data", "generated");
const sourceDir = path.join(root, "app", "data", "sources");
const lexiconPath = path.join(generatedDir, "lexicon.json");
const reviewQueuePath = path.join(generatedDir, "review-queue.json");
const coverageReportPath = path.join(generatedDir, "hanja-coverage-report.json");
const decisionsPath = path.join(root, "app", "data", "review-decisions.jsonl");

const POS_NORMALIZATION = new Map([
  ["adj", "Adjective"],
  ["noun", "Noun"],
  ["verb", "Verb"],
  ["adjective", "Adjective"],
  ["adverb", "Adverb"],
  ["proper noun", "Proper noun"],
  ["name", "Proper noun"],
  ["suffix", "Suffix"],
  ["prefix", "Prefix"],
]);

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

function normalizePos(pos) {
  if (Array.isArray(pos)) return pos.flatMap(normalizePos).filter(Boolean);
  if (!pos) return ["Word"];
  const normalized = POS_NORMALIZATION.get(String(pos).toLowerCase());
  return [normalized ?? String(pos)];
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

async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

async function readSourceJsonlByPrefix(prefix) {
  if (!existsSync(sourceDir)) return [];
  const files = (await readdir(sourceDir))
    .filter((file) => file.startsWith(prefix) && file.endsWith(".jsonl"))
    .sort((left, right) => left.localeCompare(right));
  const records = await Promise.all(files.map((file) => readJsonl(path.join(sourceDir, file))));
  return records.flat();
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

async function loadSeedSources() {
  const [koSenses, englishEntries, reviewed] = await Promise.all([
    readSourceJsonlByPrefix("ko-senses"),
    readSourceJsonlByPrefix("english-glosses"),
    readJsonl(decisionsPath),
  ]);

  return {
    koSenses: koSenses.map((sense) => ({
      ...sense,
      pos: normalizePos(sense.pos),
      sourceRank: sense.sourceRank ?? 0.95,
    })),
    englishEntries: englishEntries.map((entry) => ({
      ...entry,
      pos: normalizePos(entry.pos),
    })),
    reviewed,
  };
}

function isKoreanScript(char) {
  return /[\uAC00-\uD7AF\u4E00-\u9FFF]/u.test(char);
}

function isHanja(char) {
  return /[\u4E00-\u9FFF]/u.test(char);
}

function compactScript(value) {
  return Array.from(String(value ?? ""))
    .filter((char) => /[\uAC00-\uD7AF\u4E00-\u9FFF]/u.test(char))
    .join("");
}

function compactHangul(value) {
  return Array.from(String(value ?? ""))
    .filter((char) => /[\uAC00-\uD7AF]/u.test(char))
    .join("");
}

function scriptFormMatchesReading(form, hangul, hanjaReadings) {
  const scriptChars = Array.from(compactScript(form));
  const hangulChars = Array.from(compactHangul(hangul));
  if (scriptChars.length !== hangulChars.length || scriptChars.length === 0) return false;
  if (!scriptChars.some(isHanja)) return false;

  return scriptChars.every((char, index) => {
    if (/[\uAC00-\uD7AF]/u.test(char)) return char === hangulChars[index];
    const readings = hanjaReadings.get(char);
    return !readings || readings.size === 0 || readings.has(hangulChars[index]);
  });
}

function filterReadableScriptForms(forms, hangul, hanjaReadings) {
  return uniqueValues(forms).filter((form) => scriptFormMatchesReading(form, hangul, hanjaReadings));
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
      return Array.from(source)
        .filter((char) => /[\uAC00-\uD7AF\u4E00-\u9FFF]/u.test(char))
        .join("");
    })
    .filter((form) => /[\u4E00-\u9FFF]/u.test(form))
    .filter(Boolean);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractParentheticalHanjaForms(raw, targetHangul) {
  const value = String(raw ?? "");
  const target = String(targetHangul ?? "").replace(/\s+/g, "");
  if (!target || !/[\u4E00-\u9FFF]/u.test(value)) return [];

  const forms = [];
  const pairPattern = /([\uAC00-\uD7AF][\uAC00-\uD7AF\s^·-]*?)\(([\u4E00-\u9FFF\s^·-]+)\)/gu;
  for (const match of value.matchAll(pairPattern)) {
    const hangulBase = match[1].replace(/[^\uAC00-\uD7AF]/gu, "");
    const hanjaBase = match[2].replace(/[^\u4E00-\u9FFF]/gu, "");
    if (!hangulBase || !hanjaBase) continue;

    if (target === hangulBase) {
      forms.push(hanjaBase);
      continue;
    }

    if (target.startsWith(hangulBase)) {
      forms.push(`${hanjaBase}${target.slice(hangulBase.length)}`);
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
  etymologyForms.push(...collectEtymologyHanjaForms(entry, hangul));

  return filterReadableScriptForms(etymologyForms, hangul, hanjaReadings);
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

async function loadWiktionaryAlignedEntries(limit, hanjaReadings) {
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
      for (const gloss of sense.glosses ?? []) {
        if (gloss.startsWith("hanja form of")) continue;
        if (gloss.includes("MC reading:") || gloss.startsWith("More information")) continue;
        definitions.push({
          text: gloss,
          pos: normalizePos(entry.pos),
          examples: (sense.examples ?? []).map((example) => example.text).filter(Boolean),
          tags: sense.tags ?? [],
          sourceIds: [`wiktionary:${sense.id ?? entry.word}`],
          confidence: 0.86,
        });
      }
    }
    if (definitions.length === 0) continue;
    const hasExplicitHanja = hanja && /[\u4E00-\u9FFF]/u.test(hanja);
    results.push({
      id: `wiktionary:${hangul}:${hasExplicitHanja ? hanja : "hangul-only"}:${results.length}`,
      hangul,
      hanja: hasExplicitHanja ? hanja : hangul,
      alternateHanja: hasExplicitHanja ? hanjaForms.slice(1) : [],
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
      byKey.set(key, {
        ...entry,
        definitions: [...entry.definitions],
        alternateHanja: [...new Set(entry.alternateHanja ?? [])],
        alternateForms: [...(entry.alternateForms ?? [])],
        provenance: [...new Set(entry.provenance ?? [])],
      });
      continue;
    }
    existing.definitions.push(...entry.definitions);
    existing.alternateHanja = [...new Set([...(existing.alternateHanja ?? []), ...(entry.alternateHanja ?? [])])];
    existing.alternateForms = mergeAlternateForms(existing.alternateForms ?? [], entry.alternateForms ?? []);
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

function getNorthKoreanTarget(definitions) {
  for (const definition of definitions ?? []) {
    if (!(definition.tags ?? []).includes("North-Korea")) continue;
    const match = definition.text.match(/^North Korea standard form of\s+([^\s(（]+)(?:\(([\u4E00-\u9FFF]+)\))?/);
    if (!match) continue;
    return {
      hangul: match[1],
      hanja: match[2] ?? "",
    };
  }
  return null;
}

function isRedirectDefinition(definition) {
  return /^North Korea standard form of\s+/.test(definition.text);
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

  for (const entry of entries) {
    const target = getNorthKoreanTarget(entry.definitions);
    if (!target || target.hangul === entry.hangul) continue;

    const candidates = byHangul.get(target.hangul) ?? [];
    const targetEntry =
      candidates.find((candidate) => candidate.hanja === (target.hanja || entry.hanja)) ??
      candidates.find((candidate) => candidate.hanja === entry.hanja) ??
      candidates.find((candidate) => target.hanja && candidate.alternateHanja?.includes(target.hanja)) ??
      candidates[0];

    if (!targetEntry) continue;

    const alternate = {
      form: entry.hanja && entry.hanja !== entry.hangul ? entry.hanja : entry.hangul,
      reading: entry.hangul,
      label: "North Korean",
    };

    targetEntry.alternateForms = mergeAlternateForms(targetEntry.alternateForms ?? [], [alternate]);
    targetEntry.provenance = [...new Set([...(targetEntry.provenance ?? []), ...(entry.provenance ?? [])])];

    const transferableDefinitions = entry.definitions.filter((definition) => !isRedirectDefinition(definition));
    if (transferableDefinitions.length > 0) {
      targetEntry.definitions.push(...transferableDefinitions);
    }

    removed.add(entry.id);
  }

  return entries.filter((entry) => !removed.has(entry.id));
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
  const { koSenses, englishEntries, reviewed } = await loadSeedSources();
  const aligned = alignSeedSources(koSenses, englishEntries);
  const wiktionary = includeWiktionary ? await loadWiktionaryAlignedEntries(wiktionaryLimit, hanjaReadings) : [];
  const derived = inferDerivedHanja(
    mergeAlternativeHanjaForms(mergeNorthKoreanSpellingVariants(mergeDuplicateEntries([...aligned.lexicon, ...wiktionary]))),
    hanjaReadings,
  );
  const lexicon = applyReviewedDecisions(
    mergeDuplicateEntries(derived.entries),
    reviewed,
  );
  const reviewItems = [...aligned.reviewQueue, ...derived.reviewQueue];

  const metadata = {
    builtAt: new Date().toISOString(),
    sources: {
      koSenseCount: koSenses.length,
      englishEntryCount: englishEntries.length,
      hanjaReadingCount: hanjaReadings.size,
      reviewedDecisionCount: reviewed.length,
      wiktionaryIncluded: includeWiktionary,
      wiktionaryEntryLimit: includeWiktionary
        ? Number.isFinite(wiktionaryLimit)
          ? wiktionaryLimit
          : "all"
        : 0,
    },
    derivedHanja: derived.stats,
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
