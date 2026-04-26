/**
 * Generate a rice-paper / kraft-paper background texture used site-wide.
 * Matches the warm tan + subtle fibers + faint scratches aesthetic.
 *
 * Run: npx tsx --env-file=.env.local scripts/generate-paper-bg.ts
 * Cost: ~$0.05 (gpt-image-1.5 medium, 1536×1024)
 */
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";

const PROMPT = `A warm tan kraft paper / aged rice paper texture,
flat overhead view, no objects on it. Soft natural fibers visible
throughout. A few faint pencil scratches and small flecks scattered
sparsely. Subtle darker edges from age and handling, slightly worn
corners. Color: warm khaki tan, similar to vintage manila or
unbleached card stock (#D5B57F range).

No text. No drawings. No objects. Pure paper texture only — should
work as a background for a website. Even tone across the whole frame.

Aspect: 1536×1024 (landscape).`;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const client = new OpenAI({ apiKey });

  console.log("[paper] generating site background…");
  const t0 = Date.now();
  const resp = await client.images.generate({
    model: "gpt-image-1.5",
    prompt: PROMPT,
    n: 1,
    size: "1536x1024",
    quality: "medium"
  });
  const ms = Date.now() - t0;
  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image data");
  const buf = Buffer.from(b64, "base64");
  const out = "public/preview/paper-bg.jpg";
  await writeFile(out, buf);
  console.log(`[paper] saved ${out} (${(buf.length / 1024).toFixed(1)} KB) in ${ms}ms`);
}

main().catch((err) => {
  console.error("[paper] failed:", err.message);
  process.exit(1);
});
