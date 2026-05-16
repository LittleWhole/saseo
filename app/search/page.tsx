"use client";
import { SearchBar } from "@/components/searchbar";
import { Entry } from "@/components/ui/entry";
import { Ruby } from "@/components/ui/ruby";

import { useSearchParams } from "next/navigation";
import { HanjaCharacter, SearchResult } from "./helpers";
import { Suspense, useCallback, useEffect, useState } from "react";
import { searchDictData } from "./helpers";

function ReadingRow({ label, values }: Readonly<{ label: string; values: string[] }>) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr] gap-3 text-sm">
      <dt className="font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</dt>
      <dd className="flex flex-wrap gap-2 text-stone-200">
        {values.length ? (
          values.map((value) => (
            <span key={value} className="rounded-md border border-stone-700/80 bg-stone-900/70 px-2 py-1">
              {value}
            </span>
          ))
        ) : (
          <span className="text-stone-500">No reading listed</span>
        )}
      </dd>
    </div>
  );
}

function HanjaSidePanel({ characters }: Readonly<{ characters: HanjaCharacter[] }>) {
  return (
    <aside className="lg:sticky lg:top-32 lg:self-start">
      <div className="rounded-lg border border-stone-800/80 bg-stone-950/45 p-5 shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
        <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-stone-800/80 pb-4">
          <h2 className="text-2xl font-semibold text-stone-50">
            Hanja <span className="text-lg font-medium text-stone-500">— {characters.length} found</span>
          </h2>
        </div>

        {characters.length ? (
          <div className="divide-y divide-stone-800/80">
            {characters.map((character) => {
              const primaryMeanings = character.meanings.length ? character.meanings : character.hun;
              const hasUnihan = character.sources.includes("unihan");

              return (
                <article key={character.character} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-4">
                    <div className="headword-script min-w-14 text-center text-6xl font-medium leading-none text-stone-50">
                      {character.character}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold leading-snug text-stone-100">
                          {primaryMeanings.length ? primaryMeanings.join(", ") : "Meaning pending"}
                        </p>
                        {hasUnihan && (
                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                            Unihan
                          </span>
                        )}
                      </div>
                      {!hasUnihan && (
                        <p className="mt-1 text-xs text-stone-500">Local hun/eum gloss until Unihan data is imported.</p>
                      )}
                    </div>
                  </div>
                  <dl className="mt-4 space-y-3">
                    <ReadingRow label="Hun" values={character.hun} />
                    <ReadingRow label="Eum" values={character.eum} />
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-stone-800 px-4 py-6 text-sm leading-6 text-stone-500">
            Search results with Hanja will appear here with their meanings and Korean readings.
          </div>
        )}
      </div>
    </aside>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const [entries, setEntries] = useState<SearchResult[]>([]);
  const [hanjaCharacters, setHanjaCharacters] = useState<HanjaCharacter[]>([]);
  const [error, setError] = useState("");


  const handleSearch = useCallback(async (nextQuery?: string) => {
    const term = nextQuery ?? query;
    if (term) {
      setError("");
      const results = await searchDictData(term);
      setEntries(results.entries);
      setHanjaCharacters(results.hanjaCharacters);
    }
  }, [query]);


  useEffect(() => {
    if (!query) return;
    handleSearch().catch((searchError) => {
      setError(searchError instanceof Error ? searchError.message : "Search failed");
    });
  }, [handleSearch, query]);

  return (
    <main className="min-h-screen bg-[#0d0b09] text-stone-100 font-[family-name:var(--font-geist-sans)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(16,185,129,0.11),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(180,83,9,0.10),transparent_26%)]" />
      <header className="sticky top-0 z-20 border-b border-stone-800/80 bg-[#0d0b09]/88 px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl md:px-10 xl:px-16">
        <div className="relative mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center">
          <a href="/" className="flex shrink-0 items-baseline text-3xl font-semibold tracking-normal text-stone-50 md:text-4xl">
            <span>
              <Ruby text="辭" ruby="사" />
              <Ruby text="書" ruby="서" /> Saseo
            </span>
          </a>
          <div className="min-w-0 flex-1">
            <SearchBar searchPage={true} initialQuery={query ?? ""} customFunction={handleSearch}/>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-12 pt-8 md:px-10 xl:px-16">
        <div className="mb-5 flex flex-col gap-2 border-b border-stone-800/80 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300/80">
              Search results
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-stone-50">
              {query ? query : "Dictionary"}
            </h1>
          </div>
          <div className="text-sm text-stone-400">
            <span className="font-semibold text-stone-200">{entries.length}</span> entries found
          </div>
        </div>
        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-4">
            {entries.map((entry) => (
              <Entry
                key={entry.id}
                hanja={entry.hanja}
                hangul={entry.hangul}
                alternateHanja={entry.alternateHanja}
                alternateForms={entry.alternateForms}
                definitions={entry.definitions}
                confidence={entry.confidence}
                reviewStatus={entry.reviewStatus}
              />
            ))}
          </div>
          <HanjaSidePanel characters={hanjaCharacters} />
        </div>
      </section>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0b09] text-stone-100" />}>
      <SearchPageContent />
    </Suspense>
  );
}
