"use client";
import { ReportBugLink } from "@/components/report-bug-link";
import { SearchBar } from "@/components/searchbar";
import { Entry } from "@/components/ui/entry";
import { Ruby } from "@/components/ui/ruby";

import { Settings } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HanjaCharacter, InflectionAnalysis, SearchPagination, SearchResult } from "./helpers";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { searchDictData } from "./helpers";

type SearchStatus = "idle" | "loading" | "success" | "error";
const MIN_SEARCH_LOADING_MS = 240;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function searchHrefForValue(value: string) {
  return `/search?q=${encodeURIComponent(value)}`;
}

function searchPageHref(query: string, page: number) {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

function parsePageParam(value: string | null) {
  const page = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function defaultPagination(): SearchPagination {
  return {
    page: 1,
    pageSize: 100,
    totalEntries: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function ReadingRow({ label, values }: Readonly<{ label: string; values: string[] }>) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr] gap-3 text-sm">
      <dt className="font-semibold text-stone-500">{label}</dt>
      <dd className="flex flex-wrap gap-2 text-stone-200">
        {values.length ? (
          values.map((value) => (
            <a
              key={value}
              href={searchHrefForValue(value)}
              className="korean-text rounded-md border border-stone-700/80 bg-stone-900/70 px-2 py-1 transition-colors hover:border-emerald-300/45 hover:bg-emerald-300/10 hover:text-emerald-100"
            >
              {value}
            </a>
          ))
        ) : (
          <span className="text-stone-500">No reading listed</span>
        )}
      </dd>
    </div>
  );
}

function HanjaLoadingRows() {
  return (
    <div className="min-h-0 space-y-4 lg:pr-2">
      {["h-14 w-14", "h-14 w-14", "h-14 w-14"].map((size, index) => (
        <div key={index} className="flex items-start gap-4 border-b border-stone-800/70 pb-4 last:border-b-0">
          <div className={`${size} shrink-0 rounded-md bg-stone-800/80`} />
          <div className="min-w-0 flex-1 space-y-3 pt-1">
            <div className="h-4 w-3/4 rounded bg-stone-800/80" />
            <div className="flex gap-2">
              <div className="h-7 w-16 rounded-md bg-stone-900" />
              <div className="h-7 w-20 rounded-md bg-stone-900" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HanjaSidePanel({ characters, isLoading }: Readonly<{ characters: HanjaCharacter[]; isLoading: boolean }>) {
  return (
    <aside className="lg:sticky lg:top-32 lg:self-start">
      <div className="flex flex-col rounded-lg border border-stone-800/80 bg-stone-950/45 p-5 shadow-[0_18px_42px_rgba(0,0,0,0.24)] lg:max-h-[calc(100vh-9rem)]">
        <div className="mb-4 flex shrink-0 items-baseline justify-between gap-4 border-b border-stone-800/80 pb-4">
          <h2 className="text-2xl font-semibold text-stone-50">
            Hanja{" "}
            <span className="text-lg font-medium text-stone-500">
              {isLoading ? "— searching" : `— ${characters.length} found`}
            </span>
          </h2>
        </div>

        {isLoading ? (
          <div className="animate-pulse motion-reduce:animate-none">
            <HanjaLoadingRows />
          </div>
        ) : characters.length ? (
          <div className="min-h-0 divide-y divide-stone-800/80 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 [scrollbar-gutter:stable]">
            {characters.map((character) => {
              const primaryMeanings = character.meanings.length ? character.meanings : character.hun;

              return (
                <article key={character.character} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-4">
                    <a
                      href={searchHrefForValue(character.character)}
                      className="headword-script min-w-14 text-center text-6xl font-medium leading-none text-stone-50 transition-colors hover:text-emerald-100"
                    >
                      {character.character}
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold leading-snug text-stone-100">
                          {primaryMeanings.length ? primaryMeanings.join(", ") : "Meaning pending"}
                        </p>
                      </div>
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

function SearchLoadingState({ query }: Readonly<{ query: string }>) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-lg border border-emerald-300/20 bg-stone-950/55 shadow-[0_18px_46px_rgba(0,0,0,0.22)]"
    >
      <div className="relative border-b border-stone-800/80 px-5 py-4">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent opacity-80" />
        <div className="flex items-center gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-200">Searching dictionary</p>
            <p className="korean-text truncate text-lg text-stone-100">{query}</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-800">
          <div className="h-full w-1/3 animate-[search-progress_1.25s_ease-in-out_infinite] rounded-full bg-emerald-200 shadow-[0_0_18px_rgba(167,243,208,0.45)] motion-reduce:animate-none" />
        </div>
      </div>
      <div className="space-y-4 p-5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="grid gap-4 rounded-md border border-stone-800/80 bg-[#14100d]/70 p-4 md:grid-cols-[9rem_1fr]">
            <div className="space-y-3">
              <div className="h-9 w-24 rounded bg-stone-800/85" />
              <div className="h-4 w-16 rounded bg-stone-900" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-5/6 rounded bg-stone-800/85" />
              <div className="h-4 w-2/3 rounded bg-stone-900" />
              <div className="flex gap-2 pt-1">
                <div className="h-7 w-20 rounded-full bg-stone-900" />
                <div className="h-7 w-16 rounded-full bg-stone-900" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptySearchState({ query }: Readonly<{ query: string }>) {
  return (
    <div className="rounded-lg border border-dashed border-stone-700/90 bg-stone-950/45 px-5 py-7">
      <p className="text-lg font-semibold text-stone-100">No entries found</p>
      <p className="mt-2 text-sm leading-6 text-stone-400">
        Saseo finished searching for <span className="korean-text text-stone-200">{query}</span> and did not find a matching entry.
      </p>
    </div>
  );
}

function InflectionNotice({ inflections }: Readonly<{ inflections: InflectionAnalysis[] }>) {
  if (!inflections.length) return null;
  const primary = inflections[0];

  return (
    <div className="mb-6 rounded-xl border border-emerald-300/25 bg-emerald-300/8 p-4 text-stone-100 shadow-[0_16px_44px_rgba(0,0,0,0.18)] ring-1 ring-white/[0.03]">
      <p className="text-lg leading-7">
        <span className="korean-text">{primary.surface}</span>{" "}
        could be an inflection of{" "}
        <a
          href={searchHrefForValue(primary.lemma)}
          className="korean-text font-semibold text-emerald-200 underline decoration-emerald-300/40 underline-offset-4 hover:text-emerald-100"
        >
          {primary.lemma}
        </a>
        .
      </p>
      <div className="mt-3 space-y-2">
        {primary.forms.map((form) => (
          <div key={form.label} className="grid gap-1 text-sm leading-6 text-stone-300 md:grid-cols-[11rem_1fr]">
            <div className="font-semibold text-stone-100">{form.label}</div>
            <div>{form.description}</div>
          </div>
        ))}
      </div>
      {inflections.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-stone-400">
          <span>Also possible:</span>
          {inflections.slice(1).map((inflection) => (
            <a
              key={inflection.lemma}
              href={searchHrefForValue(inflection.lemma)}
              className="korean-text rounded-full border border-stone-700 bg-stone-950/50 px-2.5 py-1 text-emerald-200 hover:border-emerald-300/45 hover:text-emerald-100"
            >
              {inflection.lemma}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function PaginationControls({ pagination, query }: Readonly<{ pagination: SearchPagination; query: string }>) {
  if (pagination.totalPages <= 1) return null;

  const pageNumbers = Array.from(
    new Set([
      1,
      pagination.page - 1,
      pagination.page,
      pagination.page + 1,
      pagination.totalPages,
    ].filter((page) => page >= 1 && page <= pagination.totalPages)),
  ).sort((left, right) => left - right);
  const pageStart = (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(pagination.page * pagination.pageSize, pagination.totalEntries);

  return (
    <nav className="mt-6 flex flex-col gap-3 border-t border-stone-800/80 pt-5 text-sm text-stone-400 md:flex-row md:items-center md:justify-between" aria-label="Search result pages">
      <div>
        Showing <span className="text-stone-100">{pageStart}-{pageEnd}</span> of{" "}
        <span className="text-stone-100">{pagination.totalEntries}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={searchPageHref(query, pagination.page - 1)}
          aria-disabled={!pagination.hasPreviousPage}
          className={`rounded-md border px-3 py-2 font-semibold transition-colors ${
            pagination.hasPreviousPage
              ? "border-stone-700 bg-stone-950/50 text-stone-200 hover:border-emerald-300/45 hover:text-emerald-100"
              : "pointer-events-none border-stone-800 bg-stone-950/25 text-stone-600"
          }`}
        >
          Previous
        </Link>
        {pageNumbers.map((page, index) => {
          const previousPage = pageNumbers[index - 1];
          const hasGap = previousPage !== undefined && page - previousPage > 1;

          return (
            <span key={page} className="flex items-center gap-2">
              {hasGap && <span className="px-1 text-stone-600">...</span>}
              <Link
                href={searchPageHref(query, page)}
                aria-current={page === pagination.page ? "page" : undefined}
                className={`min-w-10 rounded-md border px-3 py-2 text-center font-semibold transition-colors ${
                  page === pagination.page
                    ? "border-emerald-300/45 bg-emerald-300/12 text-emerald-100"
                    : "border-stone-700 bg-stone-950/50 text-stone-200 hover:border-emerald-300/45 hover:text-emerald-100"
                }`}
              >
                {page}
              </Link>
            </span>
          );
        })}
        <Link
          href={searchPageHref(query, pagination.page + 1)}
          aria-disabled={!pagination.hasNextPage}
          className={`rounded-md border px-3 py-2 font-semibold transition-colors ${
            pagination.hasNextPage
              ? "border-stone-700 bg-stone-950/50 text-stone-200 hover:border-emerald-300/45 hover:text-emerald-100"
              : "pointer-events-none border-stone-800 bg-stone-950/25 text-stone-600"
          }`}
        >
          Next
        </Link>
      </div>
    </nav>
  );
}

function MiddleKoreanToggle({
  checked,
  onChange,
}: Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}>) {
  return (
    <label className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm font-medium text-stone-300 transition-colors hover:bg-emerald-300/10">
      <span>Middle Korean</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only appearance-none focus:outline-none focus:ring-0"
      />
      <span
        aria-hidden="true"
        className="relative h-4 w-7 rounded-full bg-stone-800 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-stone-500 after:transition-transform peer-checked:bg-emerald-300/55 peer-checked:after:translate-x-3 peer-checked:after:bg-emerald-100 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300/45 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#15110f]"
      />
    </label>
  );
}

function SearchDisplayOptions({
  showMiddleKorean,
  onShowMiddleKoreanChange,
}: Readonly<{
  showMiddleKorean: boolean;
  onShowMiddleKoreanChange: (checked: boolean) => void;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !popoverRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        aria-label="Display options"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-stone-950/70 text-sm font-semibold text-stone-100 shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0b09] ${
          isOpen
            ? "border-emerald-300/45 bg-emerald-300/10 text-emerald-100"
            : "border-stone-700/80 hover:border-emerald-300/45 hover:bg-emerald-300/10 hover:text-emerald-100"
        }`}
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-label="Display options"
          className="absolute right-0 z-30 mt-3 w-56 rounded-lg border border-emerald-300/20 bg-[#15110f] p-2 shadow-[0_18px_46px_rgba(0,0,0,0.55)] ring-1 ring-black"
        >
          <MiddleKoreanToggle checked={showMiddleKorean} onChange={onShowMiddleKoreanChange} />
        </div>
      )}
    </div>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const normalizedQuery = query?.trim() ?? "";
  const requestedPage = parsePageParam(searchParams.get("page"));
  const latestSearchId = useRef(0);
  const latestRequestedKey = useRef("");
  const [entries, setEntries] = useState<SearchResult[]>([]);
  const [hanjaCharacters, setHanjaCharacters] = useState<HanjaCharacter[]>([]);
  const [inflections, setInflections] = useState<InflectionAnalysis[]>([]);
  const [pagination, setPagination] = useState<SearchPagination>(defaultPagination);
  const [activeQuery, setActiveQuery] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState("");
  const [showMiddleKorean, setShowMiddleKorean] = useState(false);
  const requestKey = normalizedQuery ? `${normalizedQuery}\u0000${requestedPage}` : "";

  const handleSearch = useCallback(async (nextQuery?: string, nextPage = 1) => {
    const term = (nextQuery ?? query ?? "").trim();
    if (term) {
      const searchId = latestSearchId.current + 1;
      const startedAt = performance.now();
      latestSearchId.current = searchId;
      setActiveQuery(term);
      setActivePage(nextPage);
      setStatus("loading");
      setError("");
      try {
        const results = await searchDictData(term, nextPage);
        const elapsed = performance.now() - startedAt;
        if (elapsed < MIN_SEARCH_LOADING_MS) {
          await wait(MIN_SEARCH_LOADING_MS - elapsed);
        }
        if (searchId !== latestSearchId.current) return;
        setEntries(results.entries);
        setHanjaCharacters(results.hanjaCharacters);
        setInflections(results.inflections);
        setPagination(results.pagination);
        setStatus("success");
      } catch (searchError) {
        const elapsed = performance.now() - startedAt;
        if (elapsed < MIN_SEARCH_LOADING_MS) {
          await wait(MIN_SEARCH_LOADING_MS - elapsed);
        }
        if (searchId !== latestSearchId.current) return;
        setEntries([]);
        setHanjaCharacters([]);
        setInflections([]);
        setPagination(defaultPagination());
        setError(searchError instanceof Error ? searchError.message : "Search failed");
        setStatus("error");
      }
    } else {
      latestSearchId.current += 1;
      latestRequestedKey.current = "";
      setActiveQuery("");
      setActivePage(1);
      setStatus("idle");
      setEntries([]);
      setHanjaCharacters([]);
      setInflections([]);
      setPagination(defaultPagination());
      setError("");
    }
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!normalizedQuery) {
        if (latestRequestedKey.current || status !== "idle") {
          void handleSearch("");
        }
        return;
      }

      if (latestRequestedKey.current !== requestKey) {
        latestRequestedKey.current = requestKey;
        void handleSearch(normalizedQuery, requestedPage);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [handleSearch, normalizedQuery, requestedPage, requestKey, status]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      latestRequestedKey.current = "";
      void handleSearch(normalizedQuery, requestedPage);
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [handleSearch, normalizedQuery, requestedPage]);

  const isSearching = Boolean(normalizedQuery) && (status === "loading" || activeQuery !== normalizedQuery || activePage !== requestedPage);
  const hasCompletedCurrentSearch = status === "success" && activeQuery === normalizedQuery && activePage === requestedPage;
  const resultCountLabel = isSearching
    ? "Searching..."
    : hasCompletedCurrentSearch
      ? `${pagination.totalEntries} ${pagination.totalEntries === 1 ? "entry" : "entries"} found`
      : normalizedQuery
        ? "Search pending"
        : "Enter a query";

  return (
    <main className="min-h-screen bg-[#0d0b09] text-stone-100 font-[family-name:var(--font-mixed)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(16,185,129,0.11),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(180,83,9,0.10),transparent_26%)]" />
      <header className="sticky top-0 z-20 border-b border-stone-800/80 bg-[#0d0b09]/88 px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl md:px-10 xl:px-16">
        <div className="relative mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center">
          <Link href="/" className="flex shrink-0 items-baseline text-3xl font-semibold tracking-normal text-stone-50 md:text-4xl">
            <span>
              <Ruby text="辭" ruby="사" />
              <Ruby text="書" ruby="서" /> Saseo
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <SearchBar searchPage={true} initialQuery={query ?? ""} isSearching={isSearching} />
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <SearchDisplayOptions
              showMiddleKorean={showMiddleKorean}
              onShowMiddleKoreanChange={setShowMiddleKorean}
            />
            <ReportBugLink />
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-12 pt-8 md:px-10 xl:px-16">
        <div className="mb-5 flex flex-col gap-2 border-b border-stone-800/80 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium text-emerald-300/80">
              Search results
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-stone-50">
              {query ? query : "Dictionary"}
            </h1>
          </div>
          <div className="text-sm text-stone-400">
            <span className={isSearching ? "text-emerald-200" : "text-stone-200"}>{resultCountLabel}</span>
          </div>
        </div>
        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {!isSearching && <InflectionNotice inflections={inflections} />}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-4">
            {isSearching ? (
              <SearchLoadingState query={normalizedQuery} />
            ) : hasCompletedCurrentSearch && entries.length === 0 ? (
              <EmptySearchState query={normalizedQuery} />
            ) : (
              <>
                {entries.map((entry) => (
                  <Entry
                    key={entry.id}
                    hanja={entry.hanja}
                    hangul={entry.hangul}
                    middleKorean={entry.middleKorean}
                    showMiddleKorean={showMiddleKorean}
                    alternateHanja={entry.alternateHanja}
                    alternateForms={entry.alternateForms}
                    definitions={entry.definitions}
                    confidence={entry.confidence}
                    proficiency={entry.proficiency}
                  />
                ))}
                <PaginationControls pagination={pagination} query={normalizedQuery} />
              </>
            )}
          </div>
          <HanjaSidePanel characters={hanjaCharacters} isLoading={isSearching} />
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
