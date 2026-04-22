/**
 * Haiku vision judge — scores an OG-scraped image for how well it fits
 * Once's aesthetic. Stock photos, press-release portraits, logos, and
 * generic corporate scenes score low; documentary/film/photojournalism
 * frames score high.
 *
 * Called from the photo fallback chain: if OG scrape returns an image,
 * we ask the judge whether to keep it; below threshold we fall through
 * to the Unsplash keyword search instead. Fires only when OG succeeds,
 * so cost is bounded by OG hit-rate (~$0.003/call on Haiku 4.5).
 *
 * Uses prompt caching on the system prompt so repeat scoring during an
 * ingest run stays cheap.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";
const DEFAULT_THRESHOLD = 5; // 0–10; >=5 keeps the OG image.
const RELEVANCE_THRESHOLD = 5;

let _client: Anthropic | null = null;
function client(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const SYSTEM = `You are a photo-editor for a small, calm news app called Once. Every hour the app shows one ordinary moment from one city. The aesthetic is film-like, documentary, quiet — the kind of photo that could open a short story.

You score ONE image on a 0–10 scale:
  10 = a documentary / photojournalistic frame of a specific, ordinary moment (a street, a kitchen, a market scene, weather, a body doing something small)
   5 = neutral — a plausible editorial photo but somewhat posed or stocky
   0 = stock photo, press-release portrait, corporate headshot, logo, newsroom graphic, generic silhouette, clip-art

Penalize heavily: watermarks, "getty images" branding, celebrity headshots, obvious studio lighting, glossy corporate scenes, thumbs-up poses, abstract gradients.

Return strict JSON: { "score": integer 0-10, "reason": short phrase under 8 words }.`;

export async function judgeOgImage(
  imageUrl: string,
  threshold = DEFAULT_THRESHOLD
): Promise<{ keep: boolean; score: number; reason: string } | null> {
  const c = client();
  if (!c || !imageUrl) return null;

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 80,
      system: [
        {
          type: "text",
          text: SYSTEM,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl }
            },
            {
              type: "text",
              text: "Score this image."
            }
          ]
        }
      ]
    });

    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "";
    // Haiku sometimes wraps JSON in prose — pull the first {...}.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { score?: number; reason?: string };
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    return {
      keep: score >= threshold,
      score,
      reason: (parsed.reason || "").slice(0, 60)
    };
  } catch {
    return null;
  }
}

const RELEVANCE_SYSTEM = `You judge whether a photograph is RELATED to a short news vignette. Unsplash often matches on one keyword and returns an image that shares the city name but not the subject — a ferris wheel returned for a "lottery ticket" story, a generic skyline returned for a "bakery" story.

Score 0–10 on topical relevance:
  10 = the image clearly depicts the subject the vignette is about (a lottery counter for a lottery story; a flooded street for a flood story)
   5 = adjacent context (a street in the right city for a bakery story; a market scene for a food vendor story)
   0 = unrelated (a ferris wheel for a lottery story; a beach for a protest story)

Prefer rejecting a loosely-related image over keeping one. The chain has more queries to try.

Return strict JSON: { "score": integer 0-10, "reason": short phrase under 10 words }.`;

export async function judgeUnsplashRelevance(
  imageUrl: string,
  storyText: string,
  threshold = RELEVANCE_THRESHOLD
): Promise<{ keep: boolean; score: number; reason: string } | null> {
  const c = client();
  if (!c || !imageUrl || !storyText) return null;

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 80,
      system: [
        {
          type: "text",
          text: RELEVANCE_SYSTEM,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl }
            },
            {
              type: "text",
              text: `Story:\n${storyText.slice(0, 400)}\n\nScore this image's relevance.`
            }
          ]
        }
      ]
    });

    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { score?: number; reason?: string };
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    return {
      keep: score >= threshold,
      score,
      reason: (parsed.reason || "").slice(0, 60)
    };
  } catch {
    return null;
  }
}
