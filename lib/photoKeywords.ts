/**
 * Extract a visual-search keyword from a Once story.
 *
 * The Unsplash bakeoff showed that (a) queries containing the city name
 * perform far better than pure scene words, and (b) a concrete visual
 * noun paired with the city almost always returns on-brand results.
 *
 * This module calls gpt-4o-mini once per story (cheap — ~$0.00003) to
 * pull the single most photographable noun from the rewrite, then
 * concatenates `<noun> <city>`. If the LLM call fails or the text is
 * empty, we fall back to just `<city>` — which still searches usefully.
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

const SYSTEM = `You extract ONE concrete visual noun (or 2-word phrase) from a short news vignette — the single thing a photographer would frame. Prefer physical objects, places, settings. Avoid abstract nouns (sorrow, hope), avoid people's names, avoid verbs.

**Always return the noun in ENGLISH**, regardless of the input language. The noun will be used to search a stock-photo library whose index is English-dominant — a Chinese or Arabic noun returns almost nothing.

If nothing concrete, return the empty string. Return JSON: { "noun": string }.`;

export async function extractPhotoKeyword(
  storyText: string,
  cityName: string
): Promise<string> {
  const city = cityName.trim();
  const text = storyText.trim();
  if (!text) return city;

  try {
    const res = await client().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text.slice(0, 600) }
      ],
      max_tokens: 40,
      temperature: 0
    });
    const raw = res.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { noun?: string };
    const noun = (parsed.noun || "").trim();
    return noun ? `${noun} ${city}` : city;
  } catch {
    return city;
  }
}
