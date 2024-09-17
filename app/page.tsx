"use client";
import { SearchBar } from "@/components/searchbar";
import { Ruby } from "@/components/ui/ruby";

export default function Home() {

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-6xl font-bold mb-8">
        <Ruby text="辭" ruby="사"/>
        <Ruby text="書" ruby="서"/> Saseo
        </h1>
      <div className="w-full max-w-2xl px-4">
        <div className="flex items-stretch">
          <div className="relative flex-grow">
            <SearchBar searchPage={false} customFunction={() => {}}/>
          </div>
        </div>
      </div>
    </div>
  );
}
