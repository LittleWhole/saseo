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

All snapshots use the `saseo-source-v1` contract and can be checked with:

```sh
npm run lexicon:validate:sources
```

`ko-senses.<source>.jsonl` represents Korean-Korean dictionary senses with known
Hanja. Production importers for Urimalsaem, Standard Korean Dictionary, Korean
Learners' Dictionary, internal spreadsheets, or other native Korean dictionaries
should emit this format:

```json
{"sourceId":"nikl:123","hangul":"방수","hanja":"防水","pos":["Noun"],"koDefinition":"...","domains":["materials"],"sourceRank":0.98}
```

`english-glosses.<source>.jsonl` represents Korean-English glosses before they are
attached to specific Hanja senses:

```json
{"sourceId":"kedict:방수","hangul":"방수","pos":["Noun"],"glosses":["waterproofing","release of water"]}
```

`lexicon-entries.<source>.jsonl` represents entries that are already aligned and
safe to flow directly into the public lexicon:

```json
{"sourceId":"trusted:1","hangul":"가주","hanja":"加州","definitions":[{"text":"California (a state of the United States)","pos":["Proper noun"],"tags":["US"]}],"sourceRank":0.9}
```

The seed files are deliberately small smoke tests. Replace or supplement them
with source-specific importer output.

The source contract is the extension point. A new importer only has to translate
its native schema into one of these three JSONL shapes. The builder then runs the
same merge, Hanja-safety, productive-form folding, synonym normalization, review,
search, and frontend display passes. This keeps entries from Wiktionary, cc-kedict,
KRDict, Urimalsaem, or future sources visually and behaviorally identical.

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

## Hanja Safety Rules

Never promote a Hangul lemma to Hanja just because a character has the same
Korean reading. Readability is only a weak filter; it is not evidence of lexical
identity.

The Wiktionary importer therefore trusts Hanja only from high-evidence fields:

- the page title itself, when it is already mixed script;
- explicit Korean headword/template `hanja` fields;
- forms explicitly tagged as Hanja;
- `ko-etym-sino` etymologies.

Loose etymology text mining is intentionally blocked for grammatical morphemes,
hyphenated affixes, particles, determiners, and one-syllable entries. Historical
Idu/Old Korean spellings and cognate characters often record sounds, not modern
lexical Hanja, so they must not become Saseo headwords without explicit modern
lemma evidence.

Structured lemma markers are also part of the headword, not decoration. The
builder preserves and validates:

- affix hyphens, e.g. `-탕` -> `-湯`;
- Arabic numerals, e.g. `4차원` -> `4次元`;
- word spaces, e.g. `파급 효과` -> `波及 效果`.

The build fails if a generated Hanja headword strips any of those structures
from a matching Hangul headword.

At search time, structural hyphens are formatting sugar. The public entry still
renders infixes and affixes with hyphens, but the search index also stores
hyphenless variants, so a query like `겠` finds the displayed infix `-겠-`.

## Search Query Language

Search is intentionally lexical, not just string-matching.

- `*` matches zero or more characters inside indexed forms.
- `?` matches exactly one character inside indexed forms.
- Space-separated tags filter results: `#noun`, `#adjective`, `#North-Korea`,
  `#science`, `#topik1`, `#topikA`, and related aliases.
- Mixed queries combine term evidence. `日 sunlight` means entries that match
  `日` and also contain `sunlight` in searchable definition text.
- Korean queries with spaces search the full phrase and each part. This keeps
  Korean spacing useful without making spacing mandatory.
- Dense Hangul queries are also segmented against known vocabulary and common
  particles. For example, `부인을` searches the surface, `부인`, and `을`.

POS filters match definition POS labels, tag filters match definition labels and
alternate-form labels, and TOPIK filters match the easiest TOPIK badge attached
to the entry. These rules run in the API scorer, so all sources normalized into
the shared lexicon contract participate in the same behavior.

## Dueum Canonical Alternates

After Hanja assignment and productive-form folding, the builder generates
canonical initial-sound-law alternates for South Korean 두음법칙 spellings. This
is systematic and does not depend on a separate Wiktionary page existing.

For each mixed-script entry, Saseo walks the aligned Hanja/Hangul sequence
against the local Hanja reading table. If any Hanja position has a canonical
initial ㄹ/ㄴ reading whose South Korean 두음법칙 form matches the corresponding
Hangul syllable, the entry receives an `alternateForms` record:

```json
{"form":"勞動","reading":"로동","label":"North Korea, Yanbian, or archaic"}
```

The rule covers both ㄹ -> ㄴ/ㅇ and ㄴ -> ㅇ shifts across the aligned
mixed-script term, so entries such as `勞動/노동`, `歷史/역사`, `理論/이론`,
`女性/여성`, and `系列/계열` all expose their canonical `로동`, `력사`, `리론`,
`녀성`, and `계렬` readings as normal searchable other forms. The guard is
Hanja-backed: Saseo only creates the alternate when the corresponding Hanja
character has the matching canonical reading, so this does not introduce
phonological homophone Hanja guesses.

If an upstream dump also has a separate North-Korean/Yanbian spelling entry, the
builder parses both `North Korea standard form of ...` and `North Korea standard
spelling of ...` redirects. When the South Korean lemma exists, the redirect is
folded into that lemma as an alternate form instead of becoming a duplicate
public entry. When the redirect contains a usable gloss but the South Korean
lemma is otherwise absent, the builder creates the South Korean lemma and keeps
the North-Korean/Yanbian spelling as the alternate. The public search API runs
the same collapse defensively before rendering results.

## Inflected Form Search

The search API also runs a deterministic Korean inflection pass before ranking
results. This is deliberately query-time logic rather than generated lexicon
data: inflected surfaces such as `먹었습니다`, `봐요`, `가세요`, or
`간단했습니다` should point back to the dictionary lemma without polluting the
lexicon with every conjugated surface.

The analyzer strips common layered endings for:

- plain, intimate, polite, and deferential sentence-final forms;
- past, future/speculative `겠`, honorific `시/으시`, adnominal, nominal, and
  connective forms;
- common negative and progressive constructions such as `지 않아요` and
  `고 있어요`;
- productive `하다` adjective/verb forms, including honorific and future
  combinations.

Candidate lemmas are only shown if they resolve to real verb/adjective entries
or folded `formOf` annotations already present in the search index. This keeps
grammar entries such as `-겠-` searchable as themselves and prevents the old
phonological-identity problem from assigning unrelated Hanja to an inflected
query. When a candidate is accepted, `/api/search` returns an `inflections`
payload and boosts the lemma results; the frontend renders a Jisho-like notice
above the result list.

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

Eum readings prefer Unicode Unihan `kHangul` records from
`app/data/generated/unihan-readings.json`. English meanings also come from the
same compact Unihan export via `kDefinition`. Hun glosses come from the local
Korean Hanja table at `app/data/hanja.txt`, because Unihan does not carry Korean
훈 glosses. If a character has no `kHangul` record, the sidebar falls back to
the local table's eum reading and labels it as a fallback.

Naver Hanja Dictionary is useful for manual spot checks, but Naver's official
OpenAPI list does not expose a public Hanja dictionary endpoint. Do not make the
production pipeline depend on unofficial Naver scraping; use an authorized
Naver export as a future normalized source if one becomes available.

To refresh the compact Unihan export without committing the full upstream zip:

```sh
curl -L https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip -o /tmp/Unihan.zip
unzip -p /tmp/Unihan.zip Unihan_Readings.txt | npm run lexicon:import:unihan
```

The importer keeps only `kDefinition` and `kHangul`, so it is safe to regenerate
monthly with the rest of the lexicon outputs.

## TOPIK Badges

Search entries can carry proficiency badges through the optional generated file
`app/data/generated/topik-levels.json`. The current importer accepts the
Combined NIKL/TOPIK Vocabulary List TSV and keeps only the compact fields needed
for display: Hangul word, optional Hanja, and TOPIK level.

Refresh it with:

```sh
curl -L https://raw.githubusercontent.com/julienshim/combined_korean_vocabulary_list/master/results.tsv -o /tmp/topik-results.tsv
npm run lexicon:import:topik -- --input /tmp/topik-results.tsv
```

At search time, Saseo matches TOPIK rows by normalized Hangul and uses Hanja
compatibility when the source row has Hanja. If several rows match a word
family, the UI displays the easiest applicable TOPIK badge.

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
- when every public sense on an entry points to the same `...하다` form, the
  search API promotes that form for display and removes the repeated `as ...하다`
  chip, e.g. `加` displays as `加하다` rather than a bare root pretending to be a
  verb.

This differs deliberately from Wiktionary-style Korean lemmatization. It better
matches Saseo's mixed-script-first model and keeps roots, `-하다` forms, and
`-히` adverbs in one lexical family instead of scattering them across pages.

## Redirect And Synonym Glosses

Wiktionary-style redirect glosses such as `Synonym of 캘리포니아 (...)` should not
be displayed directly as definitions. The search API keeps the raw source text
in the generated lexicon, then normalizes the public response:

- resolve the synonym target against the generated lexicon;
- display the target entry's first non-redirect definition;
- attach a structured `seeAlso` reference to the target term;
- fall back to the quoted gloss inside the redirect if the target entry is not
  present yet.

This keeps source data reversible while making synonym entries read like normal
dictionary entries, e.g. `加州` displays the California definition plus `See also
캘리포니아` instead of raw redirect prose.

## Conjugation Popups

Conjugation popups are generated locally from Saseo's entry phenotype, not
scraped on demand. The frontend mirrors the register layout used by
Wiktionary's Korean conjugation templates:

- four sentence-final register columns: formal non-polite `해라체`, informal
  non-polite `해체`, informal polite `해요체`, and formal polite
  `하십시오체`;
- separate ordinary and honorific sentence-final sections;
- connective, noun, and determiner material in compact sections below the
  register matrix.

The current generator has high-confidence `하다` handling and a visibly labelled
regular fallback for non-`하다` verbs/adjectives. If the lexicon later stores
principal parts or irregular-class metadata, the popup should consume those
stored facts and only consult an external template/source at build or import
time for irregular paradigms, never during ordinary user searches.

## Sense Example Sentences

Search responses can attach examples to individual senses from the generated
sentence-bank sidecar at `app/data/generated/sentence-bank.json`. Build it with:

```sh
npm run lexicon:build:sentences
```

The builder extracts existing source examples from `lexicon.json` only when they
look like real translated sentence examples. It rejects derivational formulas,
numbered lists, bare fragments, untranslated examples, and obvious romanization
lines, then merges any normalized `app/data/sources/sentences.*.jsonl` or `.tsv`
files. At search time, the API repeats the same sentence-and-translation guard,
ranks examples by exact source definition id first, then by term and
English-gloss overlap, and returns at most two examples per sense.

Before returning the public response, the API derives an optional
`mixedScript` sentence for each example. It scans Hangul word chunks against the
generated lexicon and replaces only lexicon-backed spans whose Hanja candidate is
unambiguous or clearly favoured by the current sense and English translation.
Sentence records that carry Hanja terms must be Hanja-compatible with the entry,
so a waterproofing example tagged `防水` cannot be reused for `放水`. The pass
also handles contextual `하다` stems from productive `formOf` metadata, e.g.
`가했다` can render as `加했다`, while replacements are restricted to the start
of a Hangul chunk to avoid treating endings like `-수록` as unrelated Hanja
nouns.

The frontend renders `mixedScript` when present, otherwise the original Korean
sentence, followed by the English translation. For mixed-script examples it uses
the original Hangul sentence as the ruby reading, aligns linked chunks against
that reading, and annotates Hanja without turning the whole sentence into one
link. It does not expose internal corpus/source labels in the entry UI.

This keeps example sentences as a reusable corpus. A future Tatoeba, KRDict, or
licensed sentence-bank importer should emit `sentences.<source>.jsonl` rather
than modifying dictionary definitions directly.

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
