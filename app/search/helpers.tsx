export type SearchResult = {
  id: string;
  hanja: string;
  hangul: string;
  middleKorean?: MiddleKoreanForm[];
  alternateHanja?: string[];
  alternateForms?: AlternateForm[];
  definitions: Definition[];
  confidence?: number;
  proficiency?: ProficiencyBadge[];
};

export type MiddleKoreanForm = {
  form: string;
  yale?: string;
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
  senseGroup?: {
    label: string;
  };
  discriminator?: string;
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

export type SearchPagination = {
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type SearchResponse = {
  entries: SearchResult[];
  hanjaCharacters?: HanjaCharacter[];
  inflections?: InflectionAnalysis[];
  pagination?: SearchPagination;
  error?: string;
};

export type SearchPayload = {
  entries: SearchResult[];
  hanjaCharacters: HanjaCharacter[];
  inflections: InflectionAnalysis[];
  pagination: SearchPagination;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackPagination(entries: SearchResult[]): SearchPagination {
  return {
    page: 1,
    pageSize: 100,
    totalEntries: entries.length,
    totalPages: entries.length ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

async function fetchSearch(searchTerm: string, page = 1): Promise<SearchPayload> {
  const params = new URLSearchParams({ q: searchTerm });
  if (page > 1) params.set("page", String(page));

  const response = await fetch(`/api/search?${params.toString()}`, {
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
    pagination: data.pagination ?? fallbackPagination(data.entries),
  };
}

export async function searchDictData(searchTerm: string, page = 1): Promise<SearchPayload> {
  try {
    return await fetchSearch(searchTerm, page);
  } catch (error) {
    await delay(300);
    return fetchSearch(searchTerm, page).catch(() => {
      throw error;
    });
  }
}
