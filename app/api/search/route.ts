import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type LexiconDefinition = {
  text: string;
  pos: string[];
  examples: string[];
  tags: string[];
  sourceIds?: string[];
  confidence?: number;
};

type LexiconEntry = {
  id: string;
  hangul: string;
  hanja: string;
  alternateHanja?: string[];
  alternateForms?: Array<{
    form: string;
    reading?: string;
    label?: string;
  }>;
  definitions: LexiconDefinition[];
  provenance?: string[];
  confidence?: number;
  reviewStatus?: string;
};

type LexiconFile = {
  metadata?: Record<string, unknown>;
  entries: LexiconEntry[];
};

let cachedLexicon: LexiconFile | null = null;

async function loadLexicon() {
  if (cachedLexicon) return cachedLexicon;
  const filePath = path.join(process.cwd(), "app", "data", "generated", "lexicon.json");
  const raw = await readFile(filePath, "utf8");
  cachedLexicon = JSON.parse(raw) as LexiconFile;
  return cachedLexicon;
}

function includesNeedle(value: string | undefined, needle: string) {
  return value?.normalize("NFC").toLowerCase().includes(needle) ?? false;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().normalize("NFC") ?? "";
  if (!query) return NextResponse.json({ metadata: {}, entries: [] });

  const needle = query.toLowerCase();

  try {
    const lexicon = await loadLexicon();
    const entries = lexicon.entries
      .filter((entry) => {
        if (includesNeedle(entry.hangul, needle)) return true;
        if (includesNeedle(entry.hanja, needle)) return true;
        if ((entry.alternateHanja ?? []).some((form) => includesNeedle(form, needle))) return true;
        if (
          (entry.alternateForms ?? []).some(
            (form) => includesNeedle(form.form, needle) || includesNeedle(form.reading, needle),
          )
        ) {
          return true;
        }
        return entry.definitions.some((definition) => includesNeedle(definition.text, needle));
      })
      .sort((left, right) => {
        const exactLeft = left.hangul === query || left.hanja === query ? 1 : 0;
        const exactRight = right.hangul === query || right.hanja === query ? 1 : 0;
        if (exactLeft !== exactRight) return exactRight - exactLeft;
        return (right.confidence ?? 0) - (left.confidence ?? 0);
      })
      .slice(0, 100);

    return NextResponse.json({ metadata: lexicon.metadata ?? {}, entries });
  } catch (error) {
    console.error("Failed to search generated lexicon:", error);
    return NextResponse.json(
      { error: "Generated lexicon is missing or invalid. Run npm run lexicon:build.", entries: [] },
      { status: 500 },
    );
  }
}
