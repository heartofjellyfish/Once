/**
 * The "atlas page" daily hero — replaces the generic byōbu scroll.
 *
 * Each day this is regenerated with a prompt parameterized by that
 * day's actual story content from the 9 cities. The output is a
 * flipbook.page-style illustrated encyclopedia spread: a central
 * globe with hand-drawn city vignettes connected to it via curved
 * ink lines, every vignette echoing the day's specific story.
 *
 * For mockup: hardcoded scenes for April 25 2026.
 *
 * Run: npx tsx --env-file=.env.local scripts/generate-hero-atlas.ts
 * Cost: ~$0.20 (gpt-image-1.5 high, 1536×1024)
 */
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";

// Each scene is a specific image of THAT DAY's story moment, not a
// generic city snapshot. These map 1:1 to the 9 placeholder stories
// in app/preview/today/page.tsx.
const SCENES = [
  { city: "Tokyo",          scene: "a single ceramic teacup placed on a wooden tatami edge, steam rising softly" },
  { city: "Beijing",        scene: "a small wooden tea cart in a hutong alley at dawn, paper lantern still glowing" },
  { city: "Mumbai",         scene: "a wooden fishing dhow silhouetted against a hazy orange sunrise" },
  { city: "Istanbul",       scene: "minarets emerging from Bosphorus mist, a simit cart on a cobbled slope" },
  { city: "London",         scene: "rain pooling on cobblestones outside a small bakery window, gas-lamp glow" },
  { city: "Lagos",          scene: "a woven basket of mangoes on a wooden stool, market awning just opening" },
  { city: "São Paulo",      scene: "an empty café table under a jacaranda tree, purple petals scattered on tile" },
  { city: "San Francisco",  scene: "morning fog rolling between Victorian rooftops, one seagull in flight" },
  { city: "Sydney",         scene: "a small sailboat moored at first light, harbour water golden and calm" }
];

function buildPrompt(): string {
  const items = SCENES.map(
    (s, i) => `${i + 1}. ${s.city}: ${s.scene}`
  ).join("\n");
  return `An illustrated atlas page in the style of a vintage 19th-century
geography book or natural history encyclopedia.

Composition: at the center, a hand-drawn world globe (orthographic
projection) painted in soft watercolor washes — continents in muted
sage green and soft ochre, oceans in pale indigo wash, with delicate
ink-line latitude/longitude grid. The globe sits on warm aged
rice-paper background.

Around the globe, nine small illustrated vignettes are placed at the
approximate location of each city, each connected to the globe by a
delicate curved ink line (like a callout in a vintage map). Each
vignette is a small painterly scene roughly 200×150 px, framed by a
thin ink border:

${items}

Style: Chinese ink wash + earth-tone watercolor on aged rice paper.
Muted palette — ochre, sage green, indigo wash, terracotta, parchment
cream, dusty rose. Painterly, contemplative, no commercial polish.
Looks like a single beautifully illustrated atlas page from a calm
late-19th-century geography textbook (think DK Eyewitness or vintage
Larousse atlas).

Strict rules: NO text labels (the layout has its own typography).
NO people's faces. NO bright saturated colors. NO modern logos or
storefront signs.

Aspect: 1536×1024 (landscape).`;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const client = new OpenAI({ apiKey });

  console.log("[atlas] generating daily hero (globe + 9 city vignettes)…");
  const t0 = Date.now();
  const resp = await client.images.generate({
    model: "gpt-image-1.5",
    prompt: buildPrompt(),
    n: 1,
    size: "1536x1024",
    quality: "high"
  });
  const ms = Date.now() - t0;
  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image data");
  const buf = Buffer.from(b64, "base64");
  const out = "public/preview/hero-atlas.jpg";
  await writeFile(out, buf);
  console.log(`[atlas] saved ${out} (${(buf.length / 1024).toFixed(1)} KB) in ${ms}ms`);
  console.log("[atlas] est. cost: ~$0.20 (gpt-image-1.5 high, 1536×1024)");
}

main().catch((err) => {
  console.error("[atlas] failed:", err.message);
  process.exit(1);
});
