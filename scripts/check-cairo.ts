import { fetchArticleBody } from "@/lib/articleBody";
const url = "https://religionunplugged.com/news/kindness-at-30000-feet-a-lesson-in-interfaith-compassion";
(async () => {
  const r = await fetchArticleBody(url);
  const text = r.text || "";
  console.log("length:", text.length);
  console.log("has 'Muslim couple':", /muslim.{0,15}(couple|newlywed)/i.test(text));
  console.log("has 'honeymoon':", /honeymoon/i.test(text));
  console.log("has 'meal service':", /meal\s*service/i.test(text));
  // look for Jennifer references
  const m = text.match(/Jennifer[\s\S]{0,300}/i);
  if (m) console.log("Jennifer context:\n" + m[0].slice(0, 600));
})();
