"use client";
import { SearchBar } from "@/components/searchbar";
import { Entry } from "@/components/ui/entry";
import { Ruby } from "@/components/ui/ruby";

import { useSearchParams } from "next/navigation";
import { SearchResult, searchDictData } from "./helpers";
import { useCallback, useEffect, useState } from "react";

export default function Page() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState<string | null>(searchParams.get("q"));
  const [entries, setEntries] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);

  const handleSearch = useCallback(async (newQuery?: string) => {
    const searchTerm = newQuery !== undefined ? newQuery : query;
    if (searchTerm) {
      setLoading(true);
      setEntries([]); // Clear existing entries
      setQuery(searchTerm); // Update the query state
      setSearchComplete(false);
      console.log("Attempting to search for: " + searchTerm);
      
      for await (const result of searchDictData(searchTerm)) {
        setEntries(prevEntries => [...prevEntries, result]);
      }
      
      console.log("Completed search for: " + searchTerm);
      setLoading(false);
      setSearchComplete(true);
    }
  }, [query]);

  useEffect(() => {
    if (query) handleSearch();
  }, []);

  return (
    <div className="font-[family-name:var(--font-geist-sans)]">
      <div className="items-center pt-10 pb-6 px-40 bg-black text-white font-[family-name:var(--font-geist-sans)]">
        <div className="flex items-center content-center justify-center space-x-6">
          <h1 className="font-bold text-2xl">
            <Ruby text="辭" ruby="사" />
            <Ruby text="書" ruby="서" /> Saseo
          </h1>
          <div className="flex-grow">
            <SearchBar searchPage={true} customFunction={handleSearch} />
          </div>
        </div>
      </div>
      {loading && (
        <div className="relative w-full h-2 bg-gray-200 overflow-hidden">
          <div className="absolute top-0 left-0 h-full w-1/3 bg-blue-600 animate-loading-bar" />
        </div>
      )}
      <div className="flex item-center mt-5 px-40 pb-2">
        <h2>
          <b>Words</b> - {entries.length} found {!searchComplete && "..."}
        </h2>
      </div>
      <div className="flex-col items-center w-full px-40 pb-5 space-y-3">
        {entries.map((entry, index) => (
          <Entry
            key={`${entry.hanja}-${index}`}
            hanja={entry.hanja}
            hangul={entry.hangul}
            definitions={entry.definitions}
          />
        ))}
      </div>
    </div>
  );
}
