import { POS } from "../types";
import { promises as fs } from "fs";

type SearchResult = {
  hanja: string;
  hangul: string;
  definitions: Definition[];
};

type Definition = {
  pos: string[];
  text: string;
  examples: string[];
};

type HanjaEntry = {
  hanja: string;
  hangul: string;
};

const getData = async (): Promise<HanjaEntry[]> => {
  const response = await fetch("http://localhost:3000/api/txt", {
    cache: "no-cache",
  });
  const data = await response.json();
  return data;
};

async function searchHanja(hanja: string): Promise<SearchResult[]> {
  const returnedData: SearchResult[] = [];
  const data = await getData();
  data.forEach((entry: HanjaEntry) => {
    if (entry.hanja !== undefined && entry.hanja.includes(hanja)) {
      returnedData.push({
        hanja: entry.hanja,
        hangul: entry.hangul,
        definitions: [
          {
            pos: [POS.NOUN], //placeholder
            text: "dictionary", //placeholder
            examples: [""], //placeholder
          },
        ],
      });
    }
  });
  return returnedData;
}

export { searchHanja };
export type { SearchResult, Definition, HanjaEntry };
