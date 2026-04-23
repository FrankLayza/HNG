# HNG Stage 2 - Intelligence Query Engine

A backend demographic intelligence engine built with Express.js, TypeScript, and Prisma. This project upgrades the base profile ingestion system with advanced filtering, sorting, pagination, and a custom Natural Language Query (NLQ) search endpoint.

## Features
- **Advanced Filtering**: Combine numerical ranges (`min_age`, `max_age`) with categorical filters (`gender`, `age_group`, `country_id`).
- **Concurrent Pagination**: Uses Prisma `$transaction` to efficiently return requested data slices alongside total dataset counts.
- **Natural Language Parsing**: A custom, rule-based text engine that maps plain English queries into strict database filters.
- **Data Seeding**: Automated insertion of 2,026 base profiles utilizing robust idempotent insertions and chronologically ordered UUID v7s.

---

## 🧠 Natural Language Search (Core Feature)
**Endpoint**: `GET /api/profiles/search?q={query}`

### Parsing Approach & Supported Keywords
The NLQ Engine uses **Rule-Based Token Extraction** via Regular Expressions (Regex) and Dictionary Lookup, strictly avoiding external LLM/AI services.

1. **Age Modifiers**:
   - `above {N}`, `over {N}`, `> {N}` -> Maps to `min_age = N`
   - `below {N}`, `under {N}`, `< {N}` -> Maps to `max_age = N`
   - `young` -> Specifically maps to `min_age = 16, max_age = 24`

2. **Gender Identifiers**:
   - `female`, `females`, `woman`, `women`, `girl`, `girls` -> Maps to `gender = "female"`
   - `male`, `males`, `man`, `men`, `boy`, `boys` -> Maps to `gender = "male"`
   - *Conflict Resolution*: If both genders are detected (e.g. "male and female teenagers"), the engine intentionally **omits** the gender filter to return both datasets.

3. **Age Groups**:
   - Explicit keyword matching for: `child/children`, `teenager/teens`, `adult/adults`, `senior/seniors`.

4. **Geographic (Country) Mapping**:
   - The parser utilizes the `i18n-iso-countries` package to pull an extensive dictionary of all global country names.
   - It iterates through these names (sorted longest-first to prevent partial matching overlaps) and tests for word-boundary matches in the user's string.
   - E.g. `"males in South Africa"` securely maps to `country_id = "ZA"`.

### Parser Limitations & Edge Cases
Because the parser is strictly rule-based, it carries the following intentional limitations:
1. **No Typo Tolerance**: The regex boundary matches are exact. Searching for `"femlaes in Nigeria"` will fail to extract the gender token.
2. **Adjacency Ignorance**: The parser does not comprehend spatial geography. Searching `"people near France"` will not return neighboring countries; it will only look for explicit string matches for "France".
3. **Compound Boolean Logic**: The engine extracts tokens universally across the string. It cannot handle mutually exclusive OR grouping. For example, `"males from Kenya or females from Nigeria"` will merge all tokens, resulting in a conflicting query rather than two distinct geographic branches.
4. **Keyword Shadowing**: If a user searches for a person whose actual name is a reserved keyword (e.g., searching for "Young from Nigeria"), the parser will mistakenly map "young" to the age filter (16-24) instead of conducting a name search.

---

## 📚 API Endpoints

### 1. Get All Profiles
**GET** `/api/profiles`
Supports dynamic filtering, sorting, and pagination. All queries are combined utilizing `AND` logic.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10, max: 50)
- `gender` (male, female)
- `age_group` (child, teenager, adult, senior)
- `country_id` (ISO Code, e.g. NG)
- `min_age` / `max_age` (Numerical integers)
- `min_gender_probability` / `min_country_probability` (Floats)
- `sort_by` (age, created_at, gender_probability)
- `order` (asc, desc)

**Success Response (200)**:
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [
     {
       "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
       "name": "emmanuel",
       "gender": "male",
       "gender_probability": 0.99,
       "age": 34,
       "age_group": "adult",
       "country_id": "NG",
       "country_name": "Nigeria",
       "country_probability": 0.85,
       "created_at": "2026-04-01T12:00:00.000Z"
     }
  ]
}
```

## Setup & Seeding Instructions
1. Install dependencies: `pnpm install`
2. Sync the database: `npx prisma db push`
3. Seed the 2,026 profiles: `npx prisma db seed`
4. Run locally: `pnpm dev`
