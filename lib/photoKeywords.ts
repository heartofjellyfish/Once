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

const SYSTEM = `You generate a ladder of Unsplash search queries for a short news vignette from a specific city. The photo chain tries each query in order; first hit wins.

Rules:
- **Always English.** Unsplash's index is English-dominant.
- **Length 3–5 queries**, most specific first, most generic last.
- **Start specific**: the scene's core visual noun + the city name.
- **Then pivot by context**: if the specific combination is rare on Unsplash, drop to the scene's cultural/regional backdrop. Example: if the story is about a Tianjin lottery ruling, the ladder might be lottery ticket Tianjin → lottery shop China → lottery ticket counter → street kiosk China.
- **End generic**: the last query should almost certainly return something — a mood or setting word Unsplash always has ("street", "kitchen", "morning light", "neighborhood").
- **No proper nouns of people**, no verbs, no abstract nouns ("betrayal", "grief"). Only things a photographer frames.
- **Prefer 2–4 word phrases** over single words. "old bazaar Skopje" beats "bazaar".

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
      max_tokens: 150,
      temperature: 0.2
    });
    const raw = res.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { queries?: string[] };
    const queries = (parsed.queries || [])
      .map((q) => (q || "").trim())
      .filter((q) => q.length > 0 && q.length < 100);
    if (queries.length === 0) return fallback;
    return queries.slice(0, 5);
  } catch {
    return fallback;
  }
}
