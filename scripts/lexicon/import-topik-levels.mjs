#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = path.join(process.cwd(), "app", "data", "generated", "topik-levels.json");
const DEFAULT_SOURCE_URL = "https://github.com/julienshim/combined_korean_vocabulary_list";

function parseArgs(argv) {
  const args = {
    input: "",
    output: DEFAULT_OUTPUT,
    sourceUrl: DEFAULT_SOURCE_URL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") args.input = argv[++index] ?? "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++index] ?? DEFAULT_OUTPUT;
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--source-url") args.sourceUrl = argv[++index] ?? DEFAULT_SOURCE_URL;
    else if (arg.startsWith("--source-url=")) args.sourceUrl = arg.slice("--source-url=".length);
  }

  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeWord(value) {
  return String(value ?? "")
    .trim()
    .replace(/\d+$/u, "");
}

function levelLabel(level) {
  if (level === "A") return "TOPIK A";
  if (level === "B") return "TOPIK B";
  if (level === "C") return "TOPIK C";
  return `TOPIK ${level}`;
}

function parseTsv(raw, sourceUrl) {
  const [headerLine, ...lines] = raw.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split("\t").map((header) => header.trim());
  const column = (name) => headers.indexOf(name);
  const entries = [];
  const seen = new Set();

  for (const line of lines) {
    const columns = line.split("\t").map((value) => value.trim());
    const word = normalizeWord(columns[column("word")]);
    const topikLevel = columns[column("topik_level")]?.replace(/\r/g, "").trim();
    if (!word || !topikLevel) continue;

    const hanja = columns[column("hanja")]?.replace(/-/g, "").trim() ?? "";
    const sourceKey = `${word}\t${hanja}\t${topikLevel}`;
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);

    entries.push({
      word,
      hanja,
      topikLevel,
      label: levelLabel(topikLevel),
      source: "combined-korean-vocabulary-list",
      sourceUrl,
    });
  }

  entries.sort((left, right) => {
    if (left.word !== right.word) return left.word.localeCompare(right.word, "ko");
    if (left.topikLevel !== right.topikLevel) return left.topikLevel.localeCompare(right.topikLevel);
    return left.hanja.localeCompare(right.hanja, "ko");
  });

  return {
    metadata: {
      builtAt: new Date().toISOString(),
      source: "julienshim/combined_korean_vocabulary_list results.tsv",
      sourceUrl,
      count: entries.length,
    },
    entries,
  };
}

const args = parseArgs(process.argv.slice(2));
const raw = args.input ? await readFile(args.input, "utf8") : await readStdin();
const output = parseTsv(raw, args.sourceUrl);

await mkdir(path.dirname(args.output), { recursive: true });
await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Wrote ${output.entries.length.toLocaleString()} TOPIK records to ${args.output}`);
