import { fetchArticleBody } from "@/lib/articleBody";

const cases = [
  {
    label: "Mozana/SP",
    url: "https://www1.folha.uol.com.br/cotidiano/2026/04/linha-de-onibus-da-zona-norte-lidera-queixas-de-passageiros-em-sao-paulo.shtml",
    checkFor: ["imirim", "avenida", "20 min", "vinte min"]
  },
  {
    label: "Cairo flight",
    url: "https://religionunplugged.com/news/kindness-at-30000-feet-a-lesson-in-interfaith-compassion",
    checkFor: ["muslim", "christian", "hindu", "bride", "groom", "honeymoon", "couple", "jennifer"]
  },
  {
    label: "SP old couple",
    url: "https://www1.folha.uol.com.br/colunas/vera-iaconelli/2026/04/amor-entre-velhos.shtml",
    checkFor: ["casal", "anos", "escolhas", "ternura", "paixão"]
  }
];

(async () => {
  for (const c of cases) {
    const r = await fetchArticleBody(c.url);
    console.log("\n=== " + c.label + " (len=" + (r.text?.length || 0) + ") ===");
    const text = (r.text || "").toLowerCase();
    for (const term of c.checkFor) {
      const found = text.includes(term);
      console.log("  " + (found ? "✓" : "✗") + " '" + term + "'");
    }
  }
})();
