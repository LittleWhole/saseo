#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = path.join(process.cwd(), "app", "data", "generated", "unihan-readings.json");

function parseArgs(argv) {
  const args = {
    input: "",
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") args.input = argv[++index] ?? "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++index] ?? DEFAULT_OUTPUT;
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
  }

  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseUnihanReadings(raw) {
  const records = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^U\+([0-9A-F]+)\t(kDefinition)\t(.+)$/u);
    if (!match) continue;

    const [, codePoint, field, value] = match;
    const character = String.fromCodePoint(Number.parseInt(codePoint, 16));
    records[character] = {
      ...(records[character] ?? {}),
      [field]: value.trim(),
    };
  }
  return records;
}

const args = parseArgs(process.argv.slice(2));
const raw = args.input ? await readFile(args.input, "utf8") : await readStdin();
const records = parseUnihanReadings(raw);

await mkdir(path.dirname(args.output), { recursive: true });
await writeFile(args.output, `${JSON.stringify(records, null, 2)}\n`);

console.log(`Wrote ${Object.keys(records).length.toLocaleString()} Unihan records to ${args.output}`);
