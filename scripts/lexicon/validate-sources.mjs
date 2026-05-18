#!/usr/bin/env node

import path from "node:path";
import { loadNormalizedSources } from "./source-contracts.mjs";

const root = process.cwd();

async function main() {
  const sources = await loadNormalizedSources({ root });
  const { manifest } = sources;

  console.log(`Validated Saseo source contract ${manifest.contractVersion}`);
  console.log(`Korean sense records: ${manifest.counts.koSenseCount}`);
  console.log(`English gloss records: ${manifest.counts.englishEntryCount}`);
  console.log(`Direct lexicon records: ${manifest.counts.lexiconEntryCount}`);
  console.log(`Sentence-bank records: ${manifest.counts.sentenceEntryCount}`);
  console.log(`Review decisions: ${manifest.counts.reviewedDecisionCount}`);

  for (const file of manifest.files) {
    const sourceNames = Object.entries(file.sources)
      .map(([name, count]) => `${name}:${count}`)
      .join(", ");
    console.log(`- ${path.join("app/data/sources", file.file)} (${file.kind}): ${file.records} records${sourceNames ? ` [${sourceNames}]` : ""}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
