import { Entry, POS } from "../types";
import { promises as fs } from "fs";

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

/*async function searchHanja(hanja: string): Promise<SearchResult[]> {
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
}*/

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

async function searchDictData(searchTerm: string): Promise<SearchResult[]> {
  const dictData: Entry[] = await getData();
  //console.log("Got data: " + JSON.stringify(dictData));

  // Normalize the search term
  const normalizedSearchTerm = searchTerm.normalize('NFC');

  //console.log("Searching for: " + normalizedSearchTerm);

  const resultsMap = new Map<string, SearchResult>();
  const hanjaMap = new Map<string, string>();

  for (const entry of dictData) {
    if (entry.lang === "Korean" && entry.lang_code === "ko") {
      const word = entry.word;

      let isMatch = false;

      // Check if the word matches the search term
      if (word && word.includes(normalizedSearchTerm)) {
        isMatch = true;
      }

      // Check forms
      if (!isMatch && entry.forms) {
        for (const form of entry.forms) {
          if (form.form && form.form.includes(normalizedSearchTerm)) {
            isMatch = true;
            break;
          }
        }
      }

      //console.log("Found a match: " + isMatch);

      // Check 'form_of' in senses
      if (!isMatch && entry.senses) {
        for (const sense of entry.senses) {
          if (sense.form_of) {
            for (const formOfEntry of sense.form_of) {
              if (formOfEntry.word && formOfEntry.word.includes(normalizedSearchTerm)) {
                isMatch = true;
                break;
              }
            }
          }
          if (isMatch) break;
        }
      }

      // If the search term matches, process the entry
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

        //console.log(`After forms field - Hangul: ${hangul}, Hanja: ${hanja}`);

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

        //console.log(`After ko etym sino - Hangul: ${hangul}, Hanja: ${hanja}`);

        // Extract Hangul from 'head_templates' if not already found
        if (!hangul && entry.head_templates) {
          for (const ht of entry.head_templates) {
            if (ht.args && ht.args.hangeul) {
              hangul = ht.args.hangeul;
              break;
            }
          }
        }

        //console.log(`After hangul head templates - Hangul: ${hangul}, Hanja: ${hanja}`);

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

        //console.log(`After processing forms - Hangul: ${hangul}, Hanja: ${hanja}`);

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
                    for (const example of sense.examples) {
                      if (example.text) {
                        definition.examples.push(example.text);
                      }
                    }
                  }
                  result.definitions.push(definition);
                }
              }
            }
          }
        }
      }
    }
  }

  // Convert the map back to an array
  const results = Array.from(resultsMap.values()).filter(result => result.definitions.length > 0);

  // Update results with correct hanja forms
  results.forEach(result => {
    if (!result.hanja && result.hangul) {
      const mappedHanja = hanjaMap.get(result.hangul);
      if (mappedHanja) {
        result.hanja = mappedHanja;
      }
    }
  });

  return results;
}

export { getData, searchDictData };
export type { SearchResult, Definition };
