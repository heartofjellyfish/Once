// Photo bakeoff — Openverse + Unsplash side-by-side for the same stories
// and queries. Writes a gallery HTML for eyeball comparison.
//
// Run from repo root:
//   node --env-file=/Users/qliu/Once/.env.local scripts/photo-bakeoff/bakeoff.mjs
//
// Requires UNSPLASH_ACCESS_KEY. Openverse needs no key.

import { writeFileSync } from "node:fs";

const STORIES = [
  {
    id: "skopje-borek",
    city: "Skopje",
    text: "At the Old Bazaar a börek shop ran out of cheese before noon. The owner said a large group of schoolchildren had come in on a trip that morning.",
    queries: ["old bazaar skopje", "skopje morning market", "borek pastry", "macedonian bakery"],
  },
  {
    id: "tianjin-flood",
    city: "Tianjin",
    text: "Tianjin has experienced heavy rainfall, with some streets flooded to knee level, and people are using inflatable boats to navigate.",
    queries: ["tianjin street", "flooded street china", "inflatable boat rescue", "heavy rain city"],
  },
];

const PER_QUERY = 6;
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

async function openverse(q) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${PER_QUERY}`;
  const r = await fetch(url);
  if (!r.ok) return { results: [], total: 0 };
  const j = await r.json();
  return {
    total: j.result_count || 0,
    results: (j.results || []).map((x) => ({
      thumb: x.thumbnail || x.url,
      full: x.url,
      title: x.title || "",
      meta: `${x.source} · ${x.license || "?"} · ${x.creator || ""}`,
      link: x.foreign_landing_url || x.url,
    })),
  };
}

async function unsplash(q) {
  if (!UNSPLASH_KEY) return { total: 0, results: [], error: "no key" };
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${PER_QUERY}&content_filter=high`;
  const r = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
  });
  if (!r.ok) return { total: 0, results: [], error: `http ${r.status}` };
  const j = await r.json();
  return {
    total: j.total || 0,
    results: (j.results || []).map((x) => ({
      thumb: x.urls?.small,
      full: x.urls?.regular,
      title: (x.description || x.alt_description || "").slice(0, 60),
      meta: `unsplash · ${x.user?.name || ""}`,
      link: x.links?.html,
    })),
  };
}

function card(img) {
  return `<figure>
    <a href="${img.link}" target="_blank"><img src="${img.thumb}" loading="lazy"/></a>
    <figcaption><div class="t">${img.title}</div><div class="m">${img.meta}</div></figcaption>
  </figure>`;
}

function row(label, total, results, extra = "") {
  if (!results.length && extra) {
    return `<div class="lib"><h4>${label} <small>(${extra})</small></h4><div class="empty">—</div></div>`;
  }
  return `<div class="lib"><h4>${label} <small>(${total} hits)</small></h4>
    <div class="grid">${results.map(card).join("")}</div></div>`;
}

async function main() {
  const parts = [];
  for (const s of STORIES) {
    const qblocks = [];
    for (const q of s.queries) {
      const [ov, un] = await Promise.all([openverse(q), unsplash(q)]);
      qblocks.push(`
        <section class="q">
          <h3>"${q}"</h3>
          ${row("Openverse", ov.total, ov.results)}
          ${row("Unsplash", un.total, un.results, un.error)}
        </section>`);
    }
    parts.push(`
      <article class="story">
        <header><h2>${s.city} — ${s.id}</h2><p class="body">${s.text}</p></header>
        ${qblocks.join("")}
      </article>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Photo bakeoff</title>
<style>
  body{font:14px/1.5 -apple-system,ui-sans-serif,sans-serif;max-width:1400px;margin:2rem auto;padding:0 1rem;color:#222;background:#f6f3ee}
  h1{font-weight:500}
  .story{background:#fff;border:1px solid #e4ddd2;border-radius:6px;padding:1.2rem 1.5rem;margin:1.2rem 0}
  .story header h2{margin:0 0 .3rem;font-weight:500}
  .story .body{color:#555;margin:0 0 1rem;font-style:italic}
  .q{margin-top:1.5rem;padding-top:1rem;border-top:1px dashed #e4ddd2}
  .q h3{margin:0 0 .6rem;font-weight:500;font-size:1rem;color:#444}
  .lib{margin:.4rem 0 .8rem}
  .lib h4{margin:.2rem 0 .3rem;font-weight:400;font-size:.85rem;color:#888;text-transform:uppercase;letter-spacing:.04em}
  .lib h4 small{color:#bbb;font-weight:400;text-transform:none;letter-spacing:0}
  .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:.4rem}
  .empty{color:#bbb;padding:1rem;text-align:center;border:1px dashed #ddd;border-radius:3px}
  figure{margin:0}
  figure img{width:100%;height:140px;object-fit:cover;border-radius:3px;display:block;background:#ddd}
  figcaption{font-size:11px;color:#555;margin-top:.2rem;line-height:1.25}
  figcaption .t{color:#222}
  figcaption .m{color:#888}
  a{color:inherit;text-decoration:none}
</style></head><body>
<h1>Photo bakeoff — Openverse vs Unsplash</h1>
<p>Each query hits both libraries. Top 6 results. Click any thumb for source.</p>
${parts.join("")}
</body></html>`;

  const out = new URL("./out.html", import.meta.url);
  writeFileSync(out, html);
  console.log("wrote", out.pathname);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
