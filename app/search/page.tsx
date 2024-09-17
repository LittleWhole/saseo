"use client";
import { SearchBar } from "@/components/searchbar";
import { Entry } from "@/components/ui/entry";
import { Ruby } from "@/components/ui/ruby";

import { useSearchParams } from "next/navigation";
import { getData, SearchResult } from "./helpers";
import { useEffect, useState } from "react";
import { searchDictData } from "./helpers";
import readline from "readline";
import { createReadStream } from "fs";

// Now you can use searchResults in your application

export default function Page() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  //const prelimEntries: SearchResult[] = [];
  const [entries, setEntries] = useState<SearchResult[]>([]);
  let dictData = [];
  //const [maxTermLength, setMaxTermLength] = useState(0);

  /*useEffect(() => {
    if (query) {
      searchHanja(query).then((results) => {
        results.forEach((result) => {
          prelimEntries.push(result)
          setEntries(prelimEntries);
        });
      });
    }
    const longestTerm = Math.max(...entries.map(entry => entry.hanja.length));
    setMaxTermLength(longestTerm);
  });*/


  const handleSearch = async () => {
    if (query) {
      console.log("Attempting to search for: " + query);
      const results = await searchDictData(query);
      console.log("Completed search for: " + query);
      setEntries(results);
      //const longestTerm = Math.max(
      //  ...entries.map((entry) => entry.hanja.length)
      //);
      //setMaxTermLength(longestTerm);
    }
  };


    useEffect(() => {

if (query) handleSearch();}, []);

  return (
    <div className="font-[family-name:var(--font-geist-sans)]">
      <div className="items-center pt-10 pb-6 px-40 bg-black text-white font-[family-name:var(--font-geist-sans)]">
        <div className="flex items-center content-center justify-center space-x-6">
          <h1 className="font-bold text-2xl">
            <Ruby text="辭" ruby="사" />
            <Ruby text="書" ruby="서" /> Saseo
          </h1>
          <div className="flex-grow">
            {" "}
            <SearchBar searchPage={true} customFunction={handleSearch}/>
          </div>
        </div>
      </div>
      <div className="flex item-center px-40 pb-2">
        <h2>
          <b>Words</b> - {entries.length} found
        </h2>
      </div>
      <div className="flex-col items-center w-full px-40 pb-5 space-y-3">
        {entries.map((entry) => (
          <Entry
            key={entry.hanja}
            hanja={entry.hanja}
            hangul={entry.hangul}
            definitions={entry.definitions}
          />
        ))}
      </div>
    </div>
  );
}
