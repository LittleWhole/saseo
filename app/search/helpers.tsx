export type SearchResult = {
  id: string;
  hanja: string;
  hangul: string;
  alternateHanja?: string[];
  alternateForms?: AlternateForm[];
  definitions: Definition[];
  confidence?: number;
  proficiency?: ProficiencyBadge[];
};

export type AlternateForm = {
  form: string;
  reading?: string;
  label?: string;
};

export type SenseExample = {
  korean: string;
  english?: string;
  mixedScript?: string;
};

export type Definition = {
  pos: string[];
  text: string;
  examples: SenseExample[];
  tags: string[];
  seeAlso?: AlternateForm[];
  formOf?: AlternateForm;
  confidence?: number;
};

export type ProficiencyBadge = {
  system: "TOPIK";
  level: string;
  label: string;
};

export type HanjaCharacter = {
  character: string;
  meanings: string[];
  hun: string[];
  eum: string[];
};

export type InflectionAnalysis = {
  surface: string;
  lemma: string;
  forms: Array<{
    label: string;
    description: string;
  }>;
};

type SearchResponse = {
  entries: SearchResult[];
  hanjaCharacters?: HanjaCharacter[];
  inflections?: InflectionAnalysis[];
  error?: string;
};

export type SearchPayload = {
  entries: SearchResult[];
  hanjaCharacters: HanjaCharacter[];
  inflections: InflectionAnalysis[];
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSearch(searchTerm: string): Promise<SearchPayload> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`, {
    cache: "no-cache",
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Search service returned an HTML error page. Restart the dev server and try again.");
  }

  const data = (await response.json()) as SearchResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Search failed");
  }

  return {
    entries: data.entries,
    hanjaCharacters: data.hanjaCharacters ?? [],
    inflections: data.inflections ?? [],
  };
}

export async function searchDictData(searchTerm: string): Promise<SearchPayload> {
  try {
    return await fetchSearch(searchTerm);
  } catch (error) {
    await delay(300);
    return fetchSearch(searchTerm).catch(() => {
      throw error;
    });
  }
}
