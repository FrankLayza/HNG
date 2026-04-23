import countries from "i18n-iso-countries";
import { createRequire } from "module";


const require = createRequire(import.meta.url);
const en = require("i18n-iso-countries/langs/en.json");
countries.registerLocale(en);

/**
 * Parses a natural language query and extracts structured filter tokens.
 * @returns An object containing the extracted filters, or null if no tokens could be mapped.
 */
export function parseNLQ(query: string) {
  const q = query.toLowerCase();
  const filters: any = {};
  let matched = false;

  // 1. Gender extraction
  const hasFemale = /\b(female|females|woman|women|girls?)\b/.test(q);
  const hasMale = /\b(male|males|man|men|boys?)\b/.test(q);

  // If the query contains "male and female", it cancels out the gender filter
  if (hasFemale && !hasMale) {
    filters.gender = "female";
    matched = true;
  } else if (hasMale && !hasFemale) {
    filters.gender = "male";
    matched = true;
  } else if (hasMale && hasFemale) {
    matched = true; // We successfully matched tokens, but intentionally set no gender filter
  }

  // 2. Age Group extraction
  if (/\b(child|children)\b/.test(q)) {
    filters.age_group = "child";
    matched = true;
  } else if (/\b(teenager|teenagers|teens?)\b/.test(q)) {
    filters.age_group = "teenager";
    matched = true;
  } else if (/\b(adult|adults)\b/.test(q)) {
    filters.age_group = "adult";
    matched = true;
  } else if (/\b(senior|seniors)\b/.test(q)) {
    filters.age_group = "senior";
    matched = true;
  }

  // 3. Exact age keyword extraction ("young")
  if (/\byoung\b/.test(q)) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  }

  // 4. Age mathematical operators
  const aboveMatch = q.match(/\b(above|over|>)\s*(\d+)\b/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[2], 10);
    matched = true;
  }
  const belowMatch = q.match(/\b(below|under|<)\s*(\d+)\b/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[2], 10);
    matched = true;
  }

  // 5. Country extraction
  // Retrieves a dictionary of { "NG": "Nigeria", "US": "United States", ... }
  const countryNames = countries.getNames("en");
  
  // We sort by length descending so that "South Africa" is checked before "South" (if "South" was a country)
  const sortedCodes = Object.keys(countryNames).sort(
    (a, b) => countryNames[b].length - countryNames[a].length
  );

  for (const code of sortedCodes) {
    const countryName = countryNames[code].toLowerCase();
    // We check if the country name is a distinct word boundary in the string
    const regex = new RegExp(`\\b${countryName}\\b`, "i");
    if (regex.test(q)) {
      filters.country_id = code;
      matched = true;
      break;
    }
  }

  // If absolutely zero rules triggered, we abort
  if (!matched) {
    return null;
  }

  return filters;
}
