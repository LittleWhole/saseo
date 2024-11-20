import { Entry, POS } from "../types";
import { promises as fs } from "fs";
import { LRUCache } from 'lru-cache';

type SearchResult = {
  hanja: string;
  hangul: string;
  definitions: Definition[];
};

type Definition = {
  pos: POS[];
  text: string;
  examples: string[];
  tags: string[];
};

const getData = async (): Promise<Entry[]> => {
  const response = await fetch("http://localhost:3000/api/json", {
    cache: "no-cache",
  });
  const data = await response.json();
  return data;
};

function isHangul(text: string): boolean {
  // Unicode range for Hangul syllables: U+AC00–U+D7AF
  return [...text].some((char) => char >= "\uAC00" && char <= "\uD7AF");
}

function isHanja(text: string): boolean {
  // Unicode range for Hanja: U+4E00–U+9FFF
  return [...text].some((char) => char >= "\u4E00" && char <= "\u9FFF");
}

function mapPOSToEnum(posString: string): POS | null {
  if (!posString) return null;
  switch (posString.toLowerCase()) {
    case "noun":
      return POS.NOUN;
    case "verb":
      return POS.VERB;
    case "adjective":
      return POS.ADJECTIVE;
    case "adverb":
      return POS.ADVERB;
    case "particle":
      return POS.PARTICLE;
    case "conjunction":
      return POS.CONJUNCTION;
    case "interjection":
      return POS.INTERJECTION;
    case "pronoun":
      return POS.PRONOUN;
    case "prefix":
      return POS.PREFIX;
    case "suffix":
      return POS.SUFFIX;
    case "name":
      return POS.PROPER_NOUN;
    default:
      return POS.UNKNOWN; 
  }
}

function extractHanjaFromEtymology(inputHangul: string,etymology: string): [string, string] | [null, null] {
  const match = etymology.match(/(\S+)\(([^\)]+)\)/);
  console.log("Extracting Hanja from etymology: " + etymology);
  if (match && isHanja(match[2].replace('—', ''))) {
    let hangul = match[1];
    let hanja = match[2];
    
    console.log("Initial extraction - Hangul:", hangul, "Hanja:", hanja);

    if (hangul !== inputHangul) { hangul = inputHangul; hanja += "—"; }
    
    // Check if there's a '—' in the Hanja part
    const dashIndex = hanja.indexOf('—');
    if (dashIndex !== -1) {
      // Replace the '—' with hangul
      hanja = hanja.replace('—', hangul.substring(dashIndex));
      console.log("After '—' processing - Hangul:", hangul, "Hanja:", hanja);
    }
    
    return [hangul, hanja];
  } 
  console.log("No match found or not Hanja");
  return [null, null];
}

const searchCache = new LRUCache<string, SearchResult[]>({ max: 100 });

async function* searchDictData(searchTerm: string): AsyncGenerator<SearchResult, void, undefined> {
  const cachedResults = searchCache.get(searchTerm);
  if (cachedResults) {
    for (const result of cachedResults) {
      yield result;
    }
    return;
  }

  const dictData: Entry[] = await getData();
  const normalizedSearchTerm = searchTerm.normalize('NFC').toLowerCase();

  const resultsMap = new Map<string, SearchResult>();
  const hanjaMap = new Map<string, string>();

  for (const entry of dictData) {
    if (entry.lang === "Korean" && entry.lang_code === "ko") {
      const word = entry.word?.toLowerCase();

      if (!word) continue;

      let isMatch = false;

      if (word.includes(normalizedSearchTerm) || 
          normalizedSearchTerm.split('').every(char => word.includes(char))) {
        isMatch = true;
      }

      if (!isMatch && entry.forms) {
        isMatch = entry.forms.some(form => 
          form.form?.toLowerCase().includes(normalizedSearchTerm)
        );
      }

      if (!isMatch && entry.senses) {
        isMatch = entry.senses.some(sense => 
          sense.form_of?.some(formOfEntry => 
            formOfEntry.word?.toLowerCase().includes(normalizedSearchTerm)
          )
        );
      }

      if (isMatch) {
        let hanja = "";
        let hangul = "";

        // Determine if the word is Hanja or Hangul
        if (isHanja(word)) {
          hanja = word;
        } else if (isHangul(word)) {
          hangul = word;
          hanja = word;
        }

        // Extract Hangul and Hanja forms from 'forms' field
        if (entry.forms) {
          for (const form of entry.forms) {
            if (form.tags && form.form) {
              if (form.tags.includes("hangeul") && isHangul(form.form)) {
                hangul = form.form;
              } else if (isHanja(form.form.replace('—', ''))) {
                const dashIndex = form.form.indexOf('—');
                if (dashIndex !== -1) {
                  hanja = form.form.replace('—', hangul.substring(dashIndex));
                } else {
                  hanja = form.form;
                }
              }
              if (!hangul && entry.pos === "character") {
                const eumhun = form.form.split(" ");
                hangul = eumhun[eumhun.length - 1];
              }
            }
          }
        }

        // Check for ko-etym-sino template or Hanja in parentheses in etymology
        if (!(isHanja(hanja)) && entry.etymology_templates) {
          for (const template of entry.etymology_templates) {
            if (template.name === "ko-etym-sino" && template.args && template.args["1"]) {
              hanja = template.args["1"];
              console.log("Found ko-etym-sino template. Hanja:", hanja);
              break;
            } else if (template.name === "af" && template.args && template.args["2"]) {
              console.log("Processing 'af' template:", template.args["2"]);
              const [extractedHangul, extractedHanja] = extractHanjaFromEtymology(hangul, template.args["2"]);
              if (extractedHanja) {
                hanja = extractedHanja.replace('—', hangul.substring(hangul.indexOf('—')));
                if (extractedHangul) {
                  hangul = extractedHangul + hangul.substring(extractedHangul.length);
                }
                console.log("Extracted - Hangul:", hangul, "Hanja:", hanja);
                break;
              }
            }
          }
        }

        // Extract Hangul from 'head_templates' if not already found
        if (!hangul && entry.head_templates) {
          for (const ht of entry.head_templates) {
            if (ht.args && ht.args.hangeul) {
              hangul = ht.args.hangeul;
              break;
            }
          }
        }

        // Extract Hangul from 'senses' field if necessary
        if (isHanja(word) && !hangul && entry.senses) {
          for (const sense of entry.senses) {
            if (sense.form_of) {
              for (const formOfEntry of sense.form_of) {
                if (formOfEntry.word && isHangul(formOfEntry.word)) {
                  hangul = formOfEntry.word;
                  break;
                }
              }
            }
            if (hangul) break;
          }
        }

        // Check if the entry is solely a "hanja form of" definition
        const isHanjaFormOnly = entry.senses && entry.senses.every(sense => 
          sense.glosses && sense.glosses[0].startsWith("hanja form of")
        );

        if (isHanjaFormOnly && entry.senses && entry.senses[0].form_of) {
          const hangul = entry.senses[0].form_of[0].word;
          if (hangul && hanja) {
            hanjaMap.set(hangul, hanja);
          }
        } else {
          const key = `${hanja}|${hangul}`;
          let result = resultsMap.get(key);

          if (!result) {
            result = {
              hanja,
              hangul,
              definitions: []
            };
            resultsMap.set(key, result);
          }

          // Add definitions to the existing or new result
          if (entry.senses) {
            const entryPOS = entry.pos
              ? [mapPOSToEnum(entry.pos)].filter((pos) => pos !== null)
              : [];
            for (const sense of entry.senses) {
              if (sense.glosses) {
                for (const gloss of sense.glosses) {
                  const definition: Definition = {
                    pos: entryPOS as POS[],
                    text: gloss,
                    examples: [],
                    tags: [],
                  };
                  // Extract tags if available
                  if (sense.tags) {
                    definition.tags = sense.tags.map(tag => tag.toLowerCase());
                  }
                  // Extract examples if available
                  if (sense.examples) {
                    definition.examples = sense.examples
                      .filter(example => example.text)
                      .map(example => example.text!);
                  }
                  result.definitions.push(definition);
                }
              }
            }
          }

          // Yield the result immediately after processing
          if (result.definitions.length > 0) {
            yield result;
          }
        }
      }
    }
  }

  // Cache the results
  searchCache.set(searchTerm, Array.from(resultsMap.values()).filter(result => result.definitions.length > 0));
}

export { getData, searchDictData };
export type { SearchResult, Definition };
