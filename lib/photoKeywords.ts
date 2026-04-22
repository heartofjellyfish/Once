/**
 * Generate a ladder of Unsplash search queries for a Once story,
 * ordered from most specific to most generic. The photo chain tries
 * them in order and takes the first that returns any hit.
 *
 * Why a ladder, not one query: Unsplash's index is English-dominant
 * and skews toward common Western subjects. "lottery ticket Tianjin"
 * returns nothing; "lottery shop China" maybe; "street kiosk China"
 * almost always. The LLM is much better than us at knowing which
 * subject-city combinations Unsplash has and which it doesn't, and
 * at pivoting from a specific noun to a contextual backdrop when the
 * specific thing is unphotographable.
 *
 * Cost: one gpt-4o-mini call per story (~$0.00004). Called once on
 * the ingest/manual path and once on admin reroll.
 */
import OpenAI from "openai";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

const MODEL = process.env.INGEST_PREFILTER_MODEL || "gpt-4o-mini";

const SYSTEM = `You generate a ladder of Unsplash search queries for a short news vignette from a specific city. The photo chain tries each query in order; a vision judge confirms relevance; first relevant hit wins.

**Ladder philosophy**
- Unsplash's index is English-dominant and Western-skewed. Long, narrow queries ("lottery ticket booth Tianjin") almost never return ANYTHING relevant — Unsplash falls back to matching on a single keyword and returns a ferris wheel because it shares the city name.
- The winning strategy is to START WIDE, not narrow. A 2-word query with ONE subject noun + ONE place beats a 4-word descriptive phrase.
- Each subsequent query changes ONE dimension only (city → country; subject noun → adjacent subject; or drop the place entirely).

**Rules**
- **Always English.** No Chinese, Japanese, Arabic, Cyrillic.
- **Length 4–6 queries**, widest-relevant first, most generic last.
- **Query #1 = 2 words**: one concrete subject noun + the city name. No descriptive modifiers ("ticket booth", "shop counter", "morning"). Example for a Tianjin lottery story: "lottery Tianjin" (NOT "lottery ticket Tianjin").
- **Query #2**: swap city for country, keep the same subject noun. "lottery China".
- **Query #3**: drop the place entirely, widen the subject if needed. "lottery ticket".
- **Query #4–5**: pivot to cultural/regional backdrop of the scene. "Chinese street", "Beijing alley" — places the subject plausibly occurs.
- **Query #6 (last)**: a generic mood/setting word that Unsplash always has — "street", "kitchen", "morning light", "neighborhood".
- **No proper nouns of people**, no verbs, no abstract nouns ("betrayal", "grief"). Only things a photographer frames.

**Examples**

Story: Tianjin lottery invalidated, ticket gifted to lover.
  ladder: ["lottery Tianjin", "lottery China", "lottery ticket", "Chinese street", "neighborhood"]

Story: Old Bazaar borek shop ran out of cheese in Skopje.
  ladder: ["bazaar Skopje", "bazaar Macedonia", "borek", "balkan bakery", "old market", "street"]

Story: Tianjin flooded, man rowing inflatable boat through crosswalk.
  ladder: ["flood Tianjin", "flooded street China", "inflatable boat", "heavy rain city", "street"]

Return strict JSON: { "queries": string[] }.`;

export async function extractPhotoQueries(
  storyText: string,
  cityName: string
): Promise<string[]> {
  const city = cityName.trim();
  const text = storyText.trim();
  const fallback = city ? [city, "street"] : ["street"];
  if (!text) return fallback;

  try {
    const res = await client().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `City: ${city}\n\nStory:\n${text.slice(0, 800)}`
        }
      ],
      max_tokens: 220,
      temperature: 0.2
    });
    const raw = res.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { queries?: string[] };
    const queries = (parsed.queries || [])
      .map((q) => (q || "").trim())
      .filter((q) => q.length > 0 && q.length < 100);
    if (queries.length === 0) return fallback;
    return queries.slice(0, 6);
  } catch {
    return fallback;
  }
}
