# Saseo Continuity

## [PLANS]
- 2026-05-16T04:45:14-0400 [USER] Add a Jisho-like Hanja side panel on search results that lists relevant Hanja, Unihan meanings, and Korean hun/eum readings.

## [DECISIONS]
- 2026-05-16T04:45:14-0400 [CODE] Search API now owns Hanja-side-panel derivation via `hanjaCharacters`, using query text plus returned entries' Hanja lemmas, alternate forms, search forms, and `formOf` annotations.
- 2026-05-16T04:45:14-0400 [CODE] Unihan data is stored as compact `app/data/generated/unihan-readings.json` containing `kDefinition`; hun/eum readings continue to come from `app/data/hanja.txt`.

## [PROGRESS]
- 2026-05-16T04:45:14-0400 [CODE] Added `scripts/lexicon/import-unihan-readings.mjs`, `lexicon:import:unihan`, search API Hanja metadata loading, and a responsive search-page Hanja side rail.

## [DISCOVERIES]
- 2026-05-16T04:45:14-0400 [TOOL] `npm run lint` initially failed on an unrelated home-page unescaped apostrophe; fixed by changing `Korean's` to `Korean&apos;s`.
- 2026-05-16T04:45:14-0400 [TOOL] `npm run build` initially failed because the repo target rejects the regex `u` flag; removed that flag from the Hanja range regex.
- 2026-05-16T04:45:14-0400 [TOOL] Unicode current Unihan zip was available at `https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip`; generated 23,285 compact Unihan records.

## [OUTCOMES]
- 2026-05-16T04:45:14-0400 [TOOL] Verification passed: `npm run lint`, `npm run build`, local `/api/search?q=bh` returned `hanjaCharacters`, and Browser rendered the panel with no console errors.
