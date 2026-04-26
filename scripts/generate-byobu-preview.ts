/**
 * One-shot: generate a byōbu cover mockup for /preview/today.
 *
 * Calls gpt-image-1.5 with a Chinese-handscroll prompt (赭石/藤黄/花青/
 * 苔绿/宣纸) showing nine quiet morning scenes from the nine Once
 * cities. Saves to public/preview/byobu.jpg so the mockup page can
 * just <img src="/preview/byobu.jpg">.
 *
 * Run:  npx tsx --env-file=.env.local scripts/generate-byobu-preview.ts
 * Cost: ~$0.20 (gpt-image-1.5, 1536×1024, high quality)
 */
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";

const PROMPT = `A traditional Chinese horizontal handscroll painting (手卷)
depicting nine intimate dawn moments from cities around the world,
flowing across the panel from east to west like the rising sun.

Nine quiet vignettes, gently separated by soft transitions of mist
and color (no hard borders):

1. Tokyo: a steaming ceramic bowl on a wooden tatami edge, soft morning light
2. Beijing: a small tea cart in a hutong alley, paper lanterns still lit
3. Mumbai: a fishing boat silhouetted against a hazy harbor sunrise
4. Istanbul: minarets rising through Bosphorus mist, gulls in distance
5. London: rain pooling on cobblestones outside a bakery, gas lamp glow
6. Lagos: market awnings just opening, a basket of mangoes on a stool
7. São Paulo: empty café tables under jacaranda trees, purple petals scattered
8. San Francisco: fog rolling through Victorian rooftops, a single seagull
9. Sydney: a sailboat moored at first light, harbour quiet and golden

Style: Chinese ink-wash with translucent earth-tone watercolor
(赭石 ochre, 藤黄 gamboge yellow, 花青 indigo wash, 苔绿 moss green,
赤土 terracotta), painted on aged rice paper (宣纸) with visible
fibers and warm cream tone. Soft brushwork, Song dynasty landscape
sensibility — scenes blur into one another through atmospheric
perspective. Painterly, contemplative, slightly weathered.

Strictly no people's faces. No text. No legible signage. Buildings
suggested rather than detailed. No commercial polish. No bright
saturated colors.

Aspect: ultra-wide horizontal panorama, 1536×1024.`;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const client = new OpenAI({ apiKey });

  console.log("[byobu] generating with gpt-image-1.5 (1536x1024, high)…");
  const t0 = Date.now();

  // Use the Images API. As of April 2026, the default flagship is
  // gpt-image-1.5; quality "high" + landscape size matches Once's
  // panoramic byōbu format.
  const resp = await client.images.generate({
    model: "gpt-image-1.5",
    prompt: PROMPT,
    n: 1,
    size: "1536x1024",
    quality: "high"
    // gpt-image-1.5 returns base64 by default; we'll just decode and write.
  });

  const ms = Date.now() - t0;
  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) {
    console.error("[byobu] response had no b64_json:", JSON.stringify(resp).slice(0, 500));
    throw new Error("no image data in response");
  }

  const buf = Buffer.from(b64, "base64");
  const out = "public/preview/byobu.jpg";
  await writeFile(out, buf);
  console.log(`[byobu] saved ${out} (${(buf.length / 1024).toFixed(1)} KB) in ${ms}ms`);
  // Best-effort cost echo for the editor's awareness.
  console.log("[byobu] est. cost: ~$0.20 (gpt-image-1.5 high, 1536×1024)");
}

main().catch((err) => {
  console.error("[byobu] failed:", err.message);
  process.exit(1);
});
