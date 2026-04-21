/**
 * Re-rewrite all currently-approved moderation_queue rows using the
 * new gpt-4o + cinematic prompt. Overwrites original_text and
 * english_text in place so the editor sees the upgraded versions
 * on the admin page immediately.
 */
import OpenAI from "openai";
import { requireSql } from "@/lib/db";
import { fetchArticleBody } from "@/lib/articleBody";
import { ONCE_HEADER } from "@/lib/prompts";
import { recordSpend } from "@/lib/budget";

const MODEL = process.env.INGEST_REWRITE_MODEL || "gpt-4o";

const REWRITE_SYSTEM = `${ONCE_HEADER}

YOUR JOB: this candidate already passed scoring. Produce one
Once-voiced rewrite of the underlying moment, aimed at a reader
from elsewhere.

**WRITE CINEMATICALLY, NOT JOURNALISTICALLY.** The rewrite should
read like the opening shot of a short film — specific objects,
specific bodies, a frame you could photograph. Not a news summary.

Concretely, when the body provides them, INCLUDE:
- **Named physical objects** with defining detail:
  "10-litre stainless steel buckets" not "containers";
  "an electric scooter" not "transportation";
  "fallen leaves covering an abandoned swimming pool" not "an old pool".
- **Bodies + gestures**: what is a specific person DOING with their
  body? "hands clasped in prayer", "holding a scooter up proudly",
  "a chair thrown from a second-floor window".
- **Stakes EMBEDDED as fact, not rhetoric**: when the article
  carries a number that carries the B-story, include it.
  "there are fewer than 80 left" > "endangered";
  "2000 sheep now, from 100 a decade ago" > "population recovering".
- **Outsider-readable inline translations**: Once readers are "from
  elsewhere." Translate local terms inline: "busy Ikebukuro
  Station" not "Ikebukuro Station"; "an old-fashioned penny candy
  shop (dagashiya)" not "dagashiya"; "the Grain Rain solar term"
  not just "谷雨". One foreign word per sentence max.
- **One POV when possible**: write from inside ONE person's hour —
  the baker's, the rescuer's, the caregiver's. Not an omniscient
  narrator summing up a phenomenon.

Concretely, FORBID:
- Editorializing verbs: "transforming", "bringing solace", "a
  testament to", "quenches thirst and spreads kindness".
- Summary clauses: "serving as a reminder that…", "highlighting…"
- Vague emotional shorthand: "was moved by", "felt a sense of".

LENGTH: 25–45 words. One or two sentences.

LANGUAGE DISCIPLINE: original_text MUST be in the city's local_language.
- If local_language is "en", original_text is in ENGLISH and
  english_text is "".
- Otherwise, english_text is a faithful English rendering.

Return JSON only: { original_language, original_text, english_text }.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    original_language: { type: "string" },
    original_text: { type: "string" },
    english_text: { type: "string" }
  },
  required: ["original_language", "original_text", "english_text"]
} as const;

interface Row {
  id: string;
  source_url: string;
  city: string;
  country: string;
  source_input: string;
  original_language: string;
  source_host?: string;
}

async function main() {
  const sql = requireSql();
  const rows = (await sql`
    select id, source_url, city, country, source_input, original_language
    from moderation_queue
    where status = 'approved' and published_as_id is null
    order by reviewed_at desc
  `) as unknown as Row[];

  console.log(`Re-rewriting ${rows.length} approved rows with ${MODEL}...`);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const r of rows) {
    const host = (() => { try { return new URL(r.source_url).host.replace(/^www\./, ""); } catch { return ""; }})();
    const [rawTitle, ...rest] = (r.source_input ?? "").split("\n\n");
    const title = (rawTitle ?? "").trim();
    const rssBody = rest.join("\n\n").trim();

    // Fetch body fresh; fall back to RSS if gated.
    const fetched = await fetchArticleBody(r.source_url);
    const body = fetched.text && fetched.text.length > rssBody.length ? fetched.text : rssBody;

    const userContent = [
      `CITY: ${r.city}, ${r.country}`,
      `LOCAL LANGUAGE: ${r.original_language ?? "en"}`,
      "",
      `<article-content>`,
      `SOURCE: ${host}`,
      `URL: ${r.source_url}`,
      `TITLE: ${title}`,
      "",
      `BODY:`,
      body,
      `</article-content>`
    ].join("\n");

    try {
      const resp = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.55,
        max_tokens: 700,
        messages: [
          { role: "system", content: REWRITE_SYSTEM },
          { role: "user", content: userContent }
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "OnceRewriteIngest", strict: true, schema: SCHEMA }
        }
      });
      const raw = resp.choices[0]?.message?.content ?? "{}";
      const out = JSON.parse(raw) as { original_language: string; original_text: string; english_text: string };

      // Enforce en rule
      if ((r.original_language ?? "en") === "en") {
        out.english_text = "";
        out.original_language = "en";
      }

      await sql`
        update moderation_queue
        set original_text = ${out.original_text},
            english_text = ${out.english_text},
            original_language = ${out.original_language || r.original_language}
        where id = ${r.id}
      `;
      await recordSpend(
        {
          model: MODEL,
          promptTokens: resp.usage?.prompt_tokens ?? 0,
          cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          completionTokens: resp.usage?.completion_tokens ?? 0
        },
        "re_rewrite",
        r.id
      );
      console.log(`  ✓ ${r.city.padEnd(22)} ${out.original_text.slice(0, 80).replace(/\n/g, " ")}`);
    } catch (err) {
      console.error(`  ✗ ${r.city}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
