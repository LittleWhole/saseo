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
  sourceIds?: string[];
  confidence?: number;
};

type SearchResponse = {
  entries: SearchResult[];
  error?: string;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSearch(searchTerm: string): Promise<SearchResult[]> {
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

  return data.entries;
}

export async function searchDictData(searchTerm: string): Promise<SearchResult[]> {
  try {
    return await fetchSearch(searchTerm);
  } catch (error) {
    await delay(300);
    return fetchSearch(searchTerm).catch(() => {
      throw error;
    });
  }
}
