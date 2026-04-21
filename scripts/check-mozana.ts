import { fetchArticleBody } from "@/lib/articleBody";
const url = "https://www1.folha.uol.com.br/cotidiano/2026/04/linha-de-onibus-da-zona-norte-lidera-queixas-de-passageiros-em-sao-paulo.shtml";
(async () => {
  const r = await fetchArticleBody(url);
  const text = r.text || "";
  console.log("Body length:", text.length);
  console.log("Contains '20 min' / 'vinte min':", /20\s*min|vinte\s*min/i.test(text));
  const m = text.match(/mozana[\s\S]{0,500}/i);
  if (m) console.log("Context around Mozana:\n" + m[0].slice(0, 500));
  else console.log("No 'Mozana' found in body.");
})();
