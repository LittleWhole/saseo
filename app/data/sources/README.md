# Saseo Lexicon Sources

This directory contains normalized source snapshots used by the monthly lexicon
builder.

The builder expects JSONL files rather than live API calls. Keep upstream fetches
as separate, reproducible import scripts so search never depends on third-party
API availability.

## Korean Sense Spine

`ko-senses.seed.jsonl` is the Korean-side identity layer. Production imports
should emit one record per Hanja-backed Korean sense:

```json
{"sourceId":"nikl:123","hangul":"방수","hanja":"防水","pos":["Noun"],"koDefinition":"...","enDefinitionHint":"...","domains":["materials"],"tags":["hanja-backed"],"sourceRank":0.98}
```

`enDefinitionHint` is optional. It may be a human-maintained hint, a source
translation, or blank. The deterministic aligner works without it, but it helps
when no paid translation/LLM layer is available.

## English Gloss Candidates

`english-glosses.seed.jsonl` contains Korean-English dictionary glosses before
they have been attached to specific Hanja senses:

```json
{"sourceId":"kedict:방수","hangul":"방수","pos":["Noun"],"glosses":["waterproofing","release of water"],"tags":["english-gloss"]}
```

## Human Review

Reviewer decisions are appended to `app/data/review-decisions.jsonl`. The next
monthly build treats approved decisions as first-class lexicon entries and
removes rejected entries.
