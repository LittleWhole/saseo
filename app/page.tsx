"use client";
import { SearchBar } from "@/components/searchbar";
import { Ruby } from "@/components/ui/ruby";

export default function Home() {

  return (
    <main className="min-h-screen overflow-hidden bg-[#0d0b09] text-stone-100 font-[family-name:var(--font-geist-sans)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(16,185,129,0.16),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(180,83,9,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_38%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-16">
        <div className="mb-8 text-center">
          <h1 className="text-6xl font-semibold tracking-normal text-stone-50 md:text-7xl">
            <Ruby text="辭" ruby="사"/>
            <Ruby text="書" ruby="서"/> Saseo
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-stone-400 md:text-lg">
            A Korean-English dictionary centered on mixed script, Hanja, and lexical nuance.
          </p>
        </div>
        <div className="w-full max-w-3xl">
          <SearchBar searchPage={false} customFunction={() => {}}/>
        </div>
      </div>
    </main>
  );
}
