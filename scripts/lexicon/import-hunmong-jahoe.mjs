#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "app", "data", "generated", "hunmong-jahoe-readings.json");
const sourceUrl = "https://ko.wikisource.org/wiki/%ED%9B%88%EB%AA%BD%EC%9E%90%ED%9A%8C";
const sourceTitle = "훈몽자회";

const SECTION_TITLES = [
  "天文",
  "地理",
  "花品",
  "草卉",
  "樹木",
  "菓實",
  "禾糓",
  "蔬菜",
  "禽鳥",
  "獸畜",
  "鱗介",
  "蜫蟲",
  "身體",
  "天倫",
  "儒學",
  "書式",
  "人類",
  "宮宅",
  "官衙",
  "器皿",
  "食饌",
  "服飾",
  "舟船",
  "車輿",
  "鞍具",
  "軍装",
  "彩色",
  "布帛",
  "金寳",
  "音樂",
  "疾病",
  "喪葬",
  "雜語",
];

const CHOSEONG_BY_JAMO = new Map([
  ["ᄀ", 0],
  ["ᄁ", 1],
  ["ᄂ", 2],
  ["ᄃ", 3],
  ["ᄄ", 4],
  ["ᄅ", 5],
  ["ᄆ", 6],
  ["ᄇ", 7],
  ["ᄈ", 8],
  ["ᄉ", 9],
  ["ᄊ", 10],
  ["ᄋ", 11],
  ["ᅀ", 11],
  ["ᅌ", 11],
  ["ᄌ", 12],
  ["ᄍ", 13],
  ["ᄎ", 14],
  ["ᄏ", 15],
  ["ᄐ", 16],
  ["ᄑ", 17],
  ["ᄒ", 18],
]);

const JUNGSEONG_BY_JAMO = new Map([
  ["ᅡ", 0],
  ["ᅢ", 1],
  ["ᅣ", 2],
  ["ᅤ", 3],
  ["ᅥ", 4],
  ["ᅦ", 5],
  ["ᅧ", 6],
  ["ᅨ", 7],
  ["ᅩ", 8],
  ["ᅪ", 9],
  ["ᅫ", 10],
  ["ᅬ", 11],
  ["ᅭ", 12],
  ["ᅮ", 13],
  ["ᅯ", 14],
  ["ᅰ", 15],
  ["ᅱ", 16],
  ["ᅲ", 17],
  ["ᅳ", 18],
  ["ᅴ", 19],
  ["ᅵ", 20],
]);

const JONGSEONG_BY_JAMO = new Map([
  ["ᆨ", 1],
  ["ᆩ", 2],
  ["ᆪ", 3],
  ["ᆫ", 4],
  ["ᆬ", 5],
  ["ᆭ", 6],
  ["ᆮ", 7],
  ["ᆯ", 8],
  ["ᆰ", 9],
  ["ᆱ", 10],
  ["ᆲ", 11],
  ["ᆳ", 12],
  ["ᆴ", 13],
  ["ᆵ", 14],
  ["ᆶ", 15],
  ["ᆷ", 16],
  ["ᆸ", 17],
  ["ᆹ", 18],
  ["ᆺ", 19],
  ["ᆻ", 20],
  ["ᆼ", 21],
  ["ᇰ", 21],
  ["ᆽ", 22],
  ["ᆾ", 23],
  ["ᆿ", 24],
  ["ᇀ", 25],
  ["ᇁ", 26],
  ["ᇂ", 27],
]);

const PALATALIZING_INITIALS = new Map([
  [3, 12],
  [16, 14],
]);
const DEYOTIZED_VOWELS = new Map([
  [2, 0],
  [3, 1],
  [6, 4],
  [7, 5],
  [12, 8],
  [17, 13],
]);
const SIBILANT_INITIALS = new Set([9, 10, 12, 13, 14]);

function sectionUrl(title) {
  return `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(`${sourceTitle}/${title}`)}&action=render`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Saseo lexicon importer (https://github.com/LittleWhole/saseo)",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#039;/gu, "'");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value ?? "").replace(/<[^>]+>/gu, ""));
}

function cleanText(value) {
  return stripTags(value)
    .replace(/[\u200b\u200c\u200d\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanReading(value) {
  return cleanText(value)
    .replace(/[｜|]/gu, "")
    .replace(/\s+/gu, "");
}

function extractHanjaCharacter(cellHtml) {
  const text = cleanText(cellHtml).replace(/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, "");
  const characters = Array.from(text.matchAll(/\p{Script=Han}/gu), (match) => match[0]);
  return characters.length === 1 ? characters[0] : "";
}

function splitReadingCell(cellHtml) {
  const firstLine = String(cellHtml ?? "")
    .split(/<br\b[^>]*>/iu)[0]
    .replace(/<wbr\s*\/?>/giu, "\u0001");
  const segments = firstLine
    .split("\u0001")
    .map(cleanReading)
    .filter(Boolean);

  if (!segments.length) return null;
  if (segments.length === 1) return splitDenseReadingLine(segments[0]);
  const form = segments.at(-1);
  const hun = segments.slice(0, -1).join("");
  if (!form || !/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(form)) return null;
  return { form, hun };
}

function composeHangul(choseong, jungseong, jongseong = 0) {
  return String.fromCodePoint(0xac00 + choseong * 588 + jungseong * 28 + jongseong);
}

function decomposeHangul(char) {
  const code = char.codePointAt(0);
  if (!code || code < 0xac00 || code > 0xd7a3) return null;
  const offset = code - 0xac00;
  return {
    choseong: Math.floor(offset / 588),
    jungseong: Math.floor((offset % 588) / 28),
    jongseong: offset % 28,
  };
}

function modernizeSyllable(char) {
  const parts = decomposeHangul(char);
  if (!parts) return char;
  let { choseong, jungseong, jongseong } = parts;
  if (PALATALIZING_INITIALS.has(choseong) && DEYOTIZED_VOWELS.has(jungseong)) {
    choseong = PALATALIZING_INITIALS.get(choseong);
    jungseong = DEYOTIZED_VOWELS.get(jungseong);
  } else if (SIBILANT_INITIALS.has(choseong) && DEYOTIZED_VOWELS.has(jungseong)) {
    jungseong = DEYOTIZED_VOWELS.get(jungseong);
  }
  return composeHangul(choseong, jungseong, jongseong);
}

function composeModernJamo(chars, start) {
  const choseong = CHOSEONG_BY_JAMO.get(chars[start]);
  const jungseong = JUNGSEONG_BY_JAMO.get(chars[start + 1]);
  if (choseong === undefined || jungseong === undefined) return null;
  let length = 2;
  let jongseong = 0;
  const possibleJongseong = JONGSEONG_BY_JAMO.get(chars[start + 2]);
  if (possibleJongseong !== undefined) {
    jongseong = possibleJongseong;
    length = 3;
  }
  return {
    char: modernizeSyllable(composeHangul(choseong, jungseong, jongseong)),
    length,
  };
}

function modernizeMiddleKoreanEum(value) {
  const withoutTone = String(value ?? "")
    .normalize("NFC")
    .replace(/[〮〯·ㆍ]/gu, "")
    .replace(/\s+/gu, "");
  const chars = Array.from(withoutTone);
  let output = "";
  for (let index = 0; index < chars.length; index += 1) {
    const composed = composeModernJamo(chars, index);
    if (composed) {
      output += composed.char;
      index += composed.length - 1;
      continue;
    }
    if (/[\uac00-\ud7af]/u.test(chars[index])) {
      const parts = decomposeHangul(chars[index]);
      const followingJongseong = JONGSEONG_BY_JAMO.get(chars[index + 1]);
      if (parts && followingJongseong !== undefined && parts.jongseong === 0) {
        output += modernizeSyllable(composeHangul(parts.choseong, parts.jungseong, followingJongseong));
        index += 1;
        continue;
      }
      output += modernizeSyllable(chars[index]);
    }
  }
  return output;
}

function splitDenseReadingLine(value) {
  const line = cleanReading(value);
  const chars = Array.from(line);
  for (let index = 1; index < chars.length; index += 1) {
    if (/[〮〯·ㆍ]/u.test(chars[index])) continue;
    const form = chars.slice(index).join("");
    const modernReading = modernizeMiddleKoreanEum(form);
    if (/^[\uac00-\ud7af]$/u.test(modernReading)) {
      return {
        form,
        hun: chars.slice(0, index).join("") || undefined,
      };
    }
  }
  return null;
}

function parseSection(html, section) {
  const cells = Array.from(String(html ?? "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu), (match) => match[1]);
  const readings = [];
  for (let index = 0; index < cells.length - 1; index += 1) {
    const character = extractHanjaCharacter(cells[index]);
    if (!character) continue;
    const reading = splitReadingCell(cells[index + 1]);
    if (!reading) continue;
    const modernReading = modernizeMiddleKoreanEum(reading.form);
    if (!modernReading) continue;
    readings.push({
      character,
      reading: modernReading,
      form: reading.form,
      hun: reading.hun || undefined,
      section,
      source: "Hunmong Jahoe",
    });
    index += 1;
  }

  for (const match of String(html ?? "").matchAll(/<p>\s*<span\b[^>]*font-size:\s*182%[^>]*>([\s\S]*?)<\/span>\s*([\s\S]*?)(?=<\/p>)/giu)) {
    const character = extractHanjaCharacter(match[1]);
    if (!character) continue;
    const firstLine = String(match[2] ?? "").split(/\n|<br\b/iu)[0];
    const reading = splitDenseReadingLine(firstLine);
    if (!reading) continue;
    const modernReading = modernizeMiddleKoreanEum(reading.form);
    if (!modernReading) continue;
    readings.push({
      character,
      reading: modernReading,
      form: reading.form,
      hun: reading.hun,
      section,
      source: "Hunmong Jahoe",
    });
  }

  return readings;
}

async function main() {
  const readings = [];
  const sections = [];
  const skippedSections = [];

  for (const section of SECTION_TITLES) {
    const url = sectionUrl(section);
    const html = await fetchText(url);
    if (!html) {
      skippedSections.push({ title: section, url, reason: "missing Wikisource section page" });
      continue;
    }
    const sectionReadings = parseSection(html, section);
    if (!sectionReadings.length) throw new Error(`No readings parsed from ${section}`);
    readings.push(...sectionReadings);
    sections.push({ title: section, url, readingCount: sectionReadings.length });
  }

  const byKey = new Map();
  for (const reading of readings) {
    const key = `${reading.character}\u0000${reading.reading}\u0000${reading.form}`;
    if (!byKey.has(key)) byKey.set(key, reading);
  }

  const uniqueReadings = Array.from(byKey.values()).sort((left, right) => {
    const charOrder = left.character.localeCompare(right.character, "ko");
    if (charOrder !== 0) return charOrder;
    return left.reading.localeCompare(right.reading, "ko");
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: "訓蒙字會 (Hunmong Jahoe), Wikisource transcription",
          sourceUrl,
          sourceEditionNote: "Wikisource notes that the transcription is based on the 1613 Gyujanggak edition and is unpunctuated/unemended.",
          readingCount: uniqueReadings.length,
          sections,
          skippedSections,
        },
        readings: uniqueReadings,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${uniqueReadings.length} Hunmong Jahoe readings to ${path.relative(root, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
