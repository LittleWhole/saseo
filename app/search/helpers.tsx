export type SearchResult = {
  id: string;
  hanja: string;
  hangul: string;
  alternateHanja?: string[];
  alternateForms?: AlternateForm[];
  definitions: Definition[];
  provenance?: string[];
  confidence?: number;
  reviewStatus?: string;
};

export type AlternateForm = {
  form: string;
  reading?: string;
  label?: string;
};

export type Definition = {
  pos: string[];
  text: string;
  examples: string[];
  tags: string[];
  formOf?: AlternateForm;
  sourceIds?: string[];
  confidence?: number;
};

export type HanjaCharacter = {
  character: string;
  meanings: string[];
  hun: string[];
  eum: string[];
  sources: string[];
};

type SearchResponse = {
  entries: SearchResult[];
  hanjaCharacters?: HanjaCharacter[];
  error?: string;
};

export type SearchPayload = {
  entries: SearchResult[];
  hanjaCharacters: HanjaCharacter[];
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
