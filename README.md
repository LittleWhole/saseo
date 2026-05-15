# saseo
Saseo (辭書, 사서) is a Jisho.org style Korean-English web dictionary with an emphasis on Hanja.

# Sources
* [choehwanjin/libhangul](https://github.com/choehwanjin/libhangul) for Hanja-Hangeul data
* [mhagiwara/cc-kedict](https://github.com/mhagiwara/cc-kedict) for dictionary entries

# Lexicon pipeline
Saseo now searches a generated sense-aligned lexicon instead of resolving Hanja
from raw dictionary dumps at request time. Rebuild it with:

```sh
npm run lexicon:build
```

Run the local review panel with:

```sh
SASEO_REVIEW_TOKEN="choose-a-local-token" npm run dev
```

Then open `/review`. See [docs/lexicon-pipeline.md](docs/lexicon-pipeline.md)
for source formats, review decisions, and the monthly update workflow.
