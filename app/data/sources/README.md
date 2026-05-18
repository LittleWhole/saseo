# Saseo Lexicon Sources

This directory contains normalized source snapshots used by the monthly lexicon
builder.

The builder expects JSONL files rather than live API calls. Keep upstream fetches
as separate, reproducible import scripts so search never depends on third-party
API availability.

All source files use the `saseo-source-v1` contract. Validate them before a
monthly build:

```sh
npm run lexicon:validate:sources
```

The contract deliberately separates source identity from final display. Importers
may come from Wiktionary, NIKL, cc-kedict, KRDict, a spreadsheet, or a future
licensed source, but they must emit one of the normalized shapes below. The
builder then produces the same final lexicon entry phenotype used by the app:
mixed-script-first headword, ruby readings, per-sense tags, other forms, TOPIK
badges, Hanja side panel, and review queue behavior.

## Korean Sense Spine

Files named `ko-senses.<source>.jsonl` are the Korean-side identity layer.
Production imports should emit one record per Hanja-backed Korean sense:

```json
{"sourceId":"nikl:123","hangul":"방수","hanja":"防水","pos":["Noun"],"koDefinition":"...","enDefinitionHint":"...","domains":["materials"],"tags":["hanja-backed"],"sourceRank":0.98}
```

`enDefinitionHint` is optional. It may be a human-maintained hint, a source
translation, or blank. The deterministic aligner works without it, but it helps
when no paid translation/LLM layer is available.

Use this contract for native Korean dictionaries with good Hanja labelling:
Urimalsaem, Standard Korean Dictionary, Korean learner dictionaries, internal
spreadsheets, or any future Korean source. These records are the authority for
which Hanja identity a Hangul spelling can have.

## English Gloss Candidates

Files named `english-glosses.<source>.jsonl` contain Korean-English dictionary
glosses before they have been attached to specific Hanja senses:

```json
{"sourceId":"kedict:방수","hangul":"방수","pos":["Noun"],"glosses":["waterproofing","release of water"],"tags":["english-gloss"]}
```

Use this contract for English dictionaries that may not know Hanja well:
cc-kedict, KRDict English, Wiktionary gloss-only records, or user-curated English
lists. The builder aligns each gloss against the Korean sense spine and sends
ambiguous homophones to review rather than collapsing them by sound.

## Fully Aligned Lexicon Entries

Files named `lexicon-entries.<source>.jsonl` contain entries that are already
safe to show after light normalization. Use this only when a source already
provides both the correct Korean lexical identity and English definitions:

```json
{"sourceId":"trusted:1","hangul":"가주","hanja":"加州","definitions":[{"text":"California (a state of the United States)","pos":["Proper noun"],"tags":["US"]}],"alternateForms":[{"form":"캘리포니아","label":"see-also"}],"sourceRank":0.9}
```

Direct entries still go through duplicate merging, North Korean spelling merge,
productive-form folding, Hanja structural checks, search indexing, synonym
normalization, and frontend rendering. This keeps their visual and behavioral
feel identical to entries built from Korean/English paired sources.

## Example Sentence Bank

Files named `sentences.<source>.jsonl` or `sentences.<source>.tsv` contain
Korean example sentences that can be attached to senses at search time:

```json
{"sourceId":"tatoeba:123","korean":"제가 하겠습니다.","english":"I will do it.","terms":["-겠-","겠"],"sourceName":"Tatoeba","license":"CC BY 2.0 FR"}
```

For JSONL, `terms` may contain Hangul, mixed-script, Hanja, inflected forms, or
structural-hyphen forms. `definitionSourceIds` can be used when an importer knows
the exact source sense. TSV rows use:

```text
sourceId	korean	english	terms	sourceName	license
```

After importing or editing sentence sources, rebuild the generated bank:

```sh
npm run lexicon:build:sentences
```

The sentence bank is separate from `lexicon.json`; search loads it as an optional
sidecar and ranks examples by exact source-id match first, then term/gloss
overlap. This makes it safe to add broad sentence corpora without rewriting the
core dictionary entries.

## Human Review

Reviewer decisions are appended to `app/data/review-decisions.jsonl`. The next
monthly build treats approved decisions as first-class lexicon entries and
removes rejected entries.
