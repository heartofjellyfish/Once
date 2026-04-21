/**
 * Re-rewrite all currently-approved moderation_queue rows using the
 * new gpt-4o + cinematic prompt. Overwrites original_text and
 * english_text in place so the editor sees the upgraded versions
 * on the admin page immediately.
 */
import OpenAI from "openai";
import { requireSql } from "@/lib/db";
import { fetchArticleBody } from "@/lib/articleBody";
import { recordSpend } from "@/lib/budget";
import { REWRITE_SYSTEM_INGEST, REWRITE_INGEST_SCHEMA } from "@/lib/pipeline";

const MODEL = process.env.INGEST_REWRITE_MODEL || "gpt-4o";
const REWRITE_SYSTEM = REWRITE_SYSTEM_INGEST;
const SCHEMA = REWRITE_INGEST_SCHEMA;

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
  // Rewrite all approved-not-yet-published rows. Widen the window
  // when iterating the prompt so the full corpus gets the new version.
  const windowHours = Number(process.env.REWRITE_WINDOW_HOURS || "3");
  const rows = (await sql`
    select id, source_url, city, country, source_input, original_language
    from moderation_queue
    where status = 'approved'
      and published_as_id is null
      and reviewed_at > now() - make_interval(hours => ${windowHours})
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
