# Saseo Lexicon Pipeline

Saseo now treats Hanja assignment as an offline sense-alignment problem.

The application searches a generated lexicon at `app/data/generated/lexicon.json`.
That file is rebuilt by:

```sh
npm run lexicon:build
```

For a larger local pass that also imports explicitly Hanja-labelled entries from
the existing Wiktionary-style dump:

```sh
npm run lexicon:build:wiktionary
```

## Data Model

The primary object is a Hanja-backed Korean sense, not a Hangul spelling.

```json
{
  "hangul": "방수",
  "hanja": "防水",
  "definitions": [
    {
      "text": "waterproofing",
      "pos": ["Noun"],
      "sourceIds": ["nikl:...", "kedict:..."],
      "confidence": 0.91
    }
  ],
  "provenance": ["nikl:...", "kedict:..."],
  "confidence": 0.91,
  "reviewStatus": "auto-aligned"
}
```

Multiple entries may share the same Hangul spelling. That is intentional:
`방수/防水` and `방수/放水` are separate lexical senses.

## Source Layout

Normalized snapshots live in `app/data/sources`.

`ko-senses.seed.jsonl` represents Korean-Korean dictionary senses with known
Hanja. Production importers for Urimalsaem, Standard Korean Dictionary, or other
native Korean dictionaries should emit this format:

```json
{"sourceId":"nikl:123","hangul":"방수","hanja":"防水","pos":["Noun"],"koDefinition":"...","domains":["materials"],"sourceRank":0.98}
```

`english-glosses.seed.jsonl` represents Korean-English glosses before they are
attached to specific Hanja senses:

```json
{"sourceId":"kedict:방수","hangul":"방수","pos":["Noun"],"glosses":["waterproofing","release of water"]}
```

The seed files are deliberately small smoke tests. Replace or supplement them
with source-specific importer output.

## Alignment

The current aligner is deterministic and free to run. It scores every English
gloss against each Korean Hanja-backed sense in the same Hangul homophone group.
Signals include:

- English gloss overlap with Korean-source English hints.
- Hanja character semantic hints.
- POS compatibility.
- Domain compatibility.
- Source rank.

Matches below the configured confidence shape are still emitted, but marked
`needs-review` and written to `app/data/generated/review-queue.json`.

This system can run without paid LLMs. The quality ceiling rises if optional
offline machine translation, local multilingual embeddings, or paid LLM review
are added later, but the base path is deterministic.

## Human Review

Start the app with a token:

```sh
SASEO_REVIEW_TOKEN="choose-a-local-token" npm run dev
```

Open `/review`, enter the same token, and approve/reject/skip candidate
alignments. Decisions append to:

```txt
app/data/review-decisions.jsonl
```

The next `npm run lexicon:build` incorporates approved decisions with
`reviewStatus: "reviewed"` and `confidence: 1`.

The file-backed review API is meant for local curation and small internal
deployments. For multi-user production deployment, keep the same API contract
but move decisions into Postgres or another durable datastore.

## Monthly Workflow

1. Fetch upstream source snapshots into `app/data/sources`.
2. Run `npm run lexicon:build`.
3. Review high-priority queue items at `/review`.
4. Run `npm run lexicon:build` again to fold decisions into the lexicon.
5. Commit source snapshots, review decisions, generated lexicon, and docs.

## Unihan Character Sidebar

Search responses include a `hanjaCharacters` side payload for the Hanja sidebar
on `/search`. The payload is derived from the query and the returned entries'
mixed-script lemmas, alternate forms, and productive-form annotations.

Hun/eum readings come from `app/data/hanja.txt`. English meanings come from a
compact Unihan export at `app/data/generated/unihan-readings.json` when present.
If the compact Unihan export is missing, the sidebar still renders from the
local Korean Hanja table and marks those meanings as a local fallback.

To refresh the compact Unihan export without committing the full upstream zip:

```sh
curl -L https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip -o /tmp/Unihan.zip
unzip -p /tmp/Unihan.zip Unihan_Readings.txt | npm run lexicon:import:unihan
```

The importer only keeps `kDefinition`, so it is safe to regenerate monthly with
the rest of the lexicon outputs.

## Adding Source Adapters

Keep adapters boring and provenance-preserving:

- one upstream record in, one normalized JSONL record out;
- preserve upstream IDs in `sourceId`;
- do not overwrite Hanja labels from native Korean dictionaries;
- mark inferred data with lower `sourceRank`;
- never silently collapse homophones into a single Hangul entry.

Good future adapter targets:

- Urimalsaem / 우리말샘 senses with `original_language_info`.
- Standard Korean Dictionary / 표준국어대사전 origins.
- Korean Learners' Dictionary English glosses.
- cc-kedict English glosses.
- Existing Wiktionary dump as supplemental explicit-Hanja coverage.

## Derived Hanja Lemmas

Do not treat a Hangul-only derived word as truly Hangul-only until its base has
been checked. Many Korean-English sources label `간단` as `簡單` but omit the
mixed-script derived lemma `簡單하다`.

The Wiktionary importer now reads etymology pairs like `간단(簡單) + 하다` and
expands them to mixed-script lemmas such as `簡單하다`. This also keeps homophone
derivatives separate when the upstream source has separate etymologies, e.g.
`簡單하다` "simple" and `間斷하다` "pause briefly".

The same rule should be used for native Korean dictionary imports:

- import the Hanja-backed monolingual sense first;
- import each English definition as a separate sense candidate;
- if a derived form has a source etymology or base-link, compose the mixed form
  from that base;
- if multiple Hanja bases are possible and no source etymology disambiguates
  them, send it to review instead of collapsing the homophones.

This gives Saseo a cheap deterministic path for high-volume updates. LLMs can
still be used as an optional monthly reviewer for ambiguous queue items, but
they should not be required for routine Hanja labelling.

## Productive Forms

Saseo treats Sino-Korean roots as the canonical lexical anchors. Productive
forms are folded back into the root when the root exists:

- `簡單하다` definitions live under `簡單` with a `hada-adjective` or
  `hada-verb` sense tag.
- `簡單히` definitions live under `簡單` with a `hi-adv` sense tag.
- the full forms remain searchable as per-sense form annotations, so searching
  `간단하다`, `簡單하다`, or `gandanhada` still returns the `簡單` entry without
  making `簡單하다` look like a spelling alternative of the root.

This differs deliberately from Wiktionary-style Korean lemmatization. It better
matches Saseo's mixed-script-first model and keeps roots, `-하다` forms, and
`-히` adverbs in one lexical family instead of scattering them across pages.

## NIKL Open API Imports

The project includes an importer for the National Institute of Korean Language
Open APIs. Both require free API keys.

```sh
URIMALSAEM_API_KEY="..." npm run lexicon:import:urimalsaem
KRDICT_API_KEY="..." npm run lexicon:import:krdict
```

By default the importer queries Hangul-only entries from the generated lexicon.
You can also pass a newline-delimited term list:

```sh
node scripts/lexicon/import-nikl-openapi.mjs --source=urimalsaem --terms=terms.txt
```

`urimalsaem` writes Hanja-backed Korean senses to
`app/data/sources/ko-senses.urimalsaem.jsonl`. `krdict` writes English glosses to
`app/data/sources/english-glosses.krdict.jsonl`. After import, rebuild:

```sh
npm run lexicon:build:wiktionary
```

This is the intended monthly refresh loop: let Urimalsaem provide the Hanja and
Korean sense inventory, let KRDict/cc-kedict provide English gloss candidates,
then align deterministically and review only the ambiguous leftovers.
