// Openverse bakeoff — pulls images for a set of (story, queries) pairs and
// writes a side-by-side HTML gallery to scripts/photo-bakeoff/out.html.
//
// Run: node scripts/photo-bakeoff/openverse.mjs
// No API key required.

import { writeFileSync } from "node:fs";

const STORIES = [
  {
    id: "skopje-borek",
    city: "Skopje",
    text: "At the Old Bazaar a börek shop ran out of cheese before noon. The owner said a large group of schoolchildren had come in on a trip that morning.",
    queries: [
      "old bazaar skopje",
      "skopje bazaar morning",
      "borek bakery",
      "macedonian pastry shop",
    ],
  },
  {
    id: "tianjin-flood",
    city: "Tianjin",
    text: "Tianjin has experienced heavy rainfall, with some streets flooded to knee level, and people are using inflatable boats to navigate.",
    queries: [
      "tianjin street",
      "flooded street china",
      "inflatable boat flood",
      "rain city china",
    ],
  },
];

const PER_QUERY = 6;

async function fetchQuery(q) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
    q
  )}&page_size=${PER_QUERY}`;
  const res = await fetch(url);
  if (!res.ok) return { results: [], total: 0 };
  const j = await res.json();
  return { results: j.results || [], total: j.result_count || 0 };
}

function card(img) {
  const thumb = img.thumbnail || img.url;
  const creator = img.creator || "unknown";
  const license = `${img.license || "?"}${img.license_version ? " " + img.license_version : ""}`;
  const src = img.foreign_landing_url || img.url;
  return `
    <figure>
      <a href="${src}" target="_blank"><img src="${thumb}" loading="lazy"/></a>
      <figcaption>
        <div class="t">${(img.title || "").slice(0, 60)}</div>
        <div class="m">${img.source} · ${license} · ${creator}</div>
      </figcaption>
    </figure>`;
}

function section(story, groups) {
  const blocks = groups
    .map(
      (g) => `
    <section class="q">
      <h3>“${g.q}” <small>(${g.total} hits)</small></h3>
      <div class="grid">${g.results.map(card).join("")}</div>
    </section>`
    )
    .join("");
  return `
    <article class="story">
      <header>
        <h2>${story.city} — ${story.id}</h2>
        <p class="body">${story.text}</p>
      </header>
      ${blocks}
    </article>`;
}

async function main() {
  const sections = [];
  for (const s of STORIES) {
    const groups = [];
    for (const q of s.queries) {
      const { results, total } = await fetchQuery(q);
      groups.push({ q, total, results });
    }
    sections.push(section(s, groups));
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Photo bakeoff — Openverse</title>
<style>
  body{font:14px/1.5 -apple-system,ui-sans-serif,sans-serif;max-width:1200px;margin:2rem auto;padding:0 1rem;color:#222;background:#f6f3ee}
  h1{font-weight:500}
  .story{background:#fff;border:1px solid #e4ddd2;border-radius:6px;padding:1.2rem 1.5rem;margin:1.2rem 0}
  .story header h2{margin:0 0 .3rem;font-weight:500}
  .story .body{color:#555;margin:0 0 1rem;font-style:italic}
  .q{margin-top:1rem}
  .q h3{margin:.2rem 0 .4rem;font-weight:400;font-size:.95rem}
  .q h3 small{color:#888;font-weight:400}
  .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:.4rem}
  figure{margin:0}
  figure img{width:100%;height:120px;object-fit:cover;border-radius:3px;display:block;background:#ddd}
  figcaption{font-size:11px;color:#555;margin-top:.2rem;line-height:1.25}
  figcaption .t{color:#222}
  figcaption .m{color:#888}
  a{color:inherit;text-decoration:none}
</style></head>
<body>
<h1>Photo bakeoff — Openverse only</h1>
<p>Hit rate · relevancy · quality · aesthetics. Click any thumb to open the source page.</p>
${sections.join("")}
</body></html>`;

  const out = new URL("./out.html", import.meta.url);
  writeFileSync(out, html);
  console.log("wrote", out.pathname);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
