"use client";
import { SearchBar } from "@/components/searchbar";
import { Entry } from "@/components/ui/entry";
import { Ruby } from "@/components/ui/ruby";

import { useSearchParams } from "next/navigation";
import { SearchResult } from "./helpers";
import { Suspense, useCallback, useEffect, useState } from "react";
import { searchDictData } from "./helpers";

function SearchPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const [entries, setEntries] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");


  const handleSearch = useCallback(async (nextQuery?: string) => {
    const term = nextQuery ?? query;
    if (term) {
      setError("");
      const results = await searchDictData(term);
      setEntries(results);
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
          <a href="/" className="flex shrink-0 items-baseline gap-3">
            <span className="text-2xl font-semibold text-stone-50">
              <Ruby text="辭" ruby="사" />
              <Ruby text="書" ruby="서" />
            </span>
            <span className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">Saseo</span>
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
