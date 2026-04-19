# The Once voice

Read this before writing or tuning **any prompt, UI copy, or rubric that shapes what users see.** Everything else in the codebase is plumbing. This is the product.

---

## The core sentence

> **Ordinary enough they could happen anywhere, specific enough they happened in THIS place THIS hour.**

Every other rule below is commentary on this sentence.

---

## What a Once story is

| Property | What it means |
|---|---|
| **One subject** | a person, a shop, a dog, a tram. Not "the city", not "Tokyo residents". |
| **Bounded in time** | happened today, this morning, this hour. Not "this year in tech". |
| **Small in scale** | one street, one counter, one delay. Not a policy, not a trend. |
| **Concrete** | named street, named shop, specific time, specific object. "The bakery on Rua da Bica" not "a local bakery". |
| **Calibrated register** | warmth, quiet sadness, strangeness, uncanny, dignity, small wonder. **Any one** is enough. Never preachy, never cute, never sensational. |
| **Dinner-tellable** | 24 hours later, you could still describe the moment in one breath. |

## Gold exemplars (pin these in your head)

- *京都の先斗町の小さな喫茶店が今朝十時に開けた。店主は、猫が店の前で眠っていたので、少し遅れたと言った。*
  → A small Pontocho cafe opened at 10 this morning. The owner said he was late because a cat was sleeping in front of the shop.
- *Kalamaja kooli esimese klassi lapsed hilinesid täna pool tundi, sest nende õpetaja ratas sai tühjaks.*
  → Kalamaja first-graders were half an hour late today — their teacher's bike had a flat.
- *A padaria da Rua da Bica ficou sem pão de forma às duas da tarde. O padeiro disse que a entrega da farinha atrasou por causa de obras na avenida.*
  → The Rua da Bica bakery ran out of bread at 2 pm. The baker said flour delivery was late because of roadwork.
- *天津出现强降雨，部分街道积水已到膝盖，有人用充气船在路上划行。*
  → Tianjin flooded to knee level; someone rowed an inflatable boat through the street.
- *The Oaxaca market stall's regular baker didn't open; neighbouring stalls left a single flower at the empty spot.*

**What they share**: a verb happened to a specific thing, in a named place, within roughly today. Nothing more.

---

## Anti-patterns (auto-reject)

| Pattern | Why it fails | Example |
|---|---|---|
| National politics, elections, policy | Scale wrong (country, not street); register wrong (heated) | "PM announces new tax plan" |
| Markets, crypto, earnings, interest rates | Abstract, not a scene | "Bitcoin hits $90k" |
| Lists, opinion, explainers | Not a moment | "5 best ramen shops in Tokyo" |
| Celebrity, royals, pop gossip | Parasocial subject | "Taylor Swift wears red" |
| Casualty reports | Register wrong (body count) | "Typhoon kills 14" |
| Breaking news, SHOCKING headlines | Register wrong (sensational) | "BREAKING: massive fire" |
| PR / product launches | It's a pitch, not a moment | "McDonald's adds new burger" |
| Trend pieces | Wrong scale (zeitgeist, not street) | "AI is reshaping everything" |
| User questions / forum discussions | Wrong form (a question, not a scene) | "Where's good pho in D3?" |
| Vague pastoral | No anchor, could be anywhere | "Spring has come, cherry blossoms are blooming" |
| Too small | No shape, nothing observable | "Someone lost an umbrella" |

## The disaster carve-out

Weather and disasters usually fail on register and scale. But **a specific human scene *within* a weather event passes**:
- Someone rowing a boat down a flooded street ✓
- A child reading by candlelight during a blackout ✓
- A cat refusing to leave a snowbound porch ✓

**The test**: is the focus *a person doing a bounded thing*, or *a casualty count / damage estimate*?
Person-doing-thing = pass. Numbers-and-damage = fail.

---

## The rewrite register (what the final sentence looks like)

- **Length**: 20–40 words. One or two sentences.
- **No exclamation marks, no ALL CAPS, no "shockingly" / "amazingly" / "incredibly".**
- **Proper nouns stay**: keep street names, shop names, neighbourhoods, real people. Don't anonymise to "a cafe".
- **Don't invent proper nouns.** If the source doesn't say the street name, leave it unnamed.
- **Tense**: recent-past or present, depending on language convention.
- **Language**: `original_text` in the city's local language, always. `english_text` is a faithful translation, or `""` if the city is anglophone (the renderer uses this to decide whether to show the translation block).

## Register cues to *avoid*

- "*Shockingly, …*" / "*Amazingly, …*" / "*Locals are stunned as …*"
- Journalist-template openers: "*In a surprising turn of events,*"
- Editorial framing: "*This raises serious questions about …*"
- Superlatives: "*the best / the most / the never-before-seen …*"
- Marketing voice: "*Exciting news from …*" / "*You won't believe …*"
- Cuteness-pandering: "*adorable*, *furry friend*, *heart-melting*"

## Four micro-tests when tuning

1. **Window test** — after reading, do I want to look out my window?
2. **Dinner test** — could I naturally mention this to a friend at dinner tonight?
3. **Screenshot test** — if a friend screenshotted just this sentence, would they understand the scene?
4. **Rest test** — does the sentence *push* emotion (sensational), or *rest* on observation? Rest = pass.

---

## City-specific notes

Some feeds drift; here's what to expect and how to correct.

| City | Feed tendency | Correction in prompt |
|---|---|---|
| Tokyo (SoraNews24) | Occasionally overshoots cute / gimmicky | Trust it; it's the benchmark. Just filter out pure product tie-ins. |
| Taipei (Taipei Times) | Heavy on politics/economy | Prefilter must reject hard on national-politics cues. |
| İstanbul (Daily Sabah Life) | Lifestyle but occasional nationalism | Be strict on register; skip anything policy-adjacent. |
| Ljubljana (Slovenia Times) | Small country → national reads like local | Accept nation-level scenes only if they have a single-subject hook. |
| Antigua Guatemala (Qué Pasa) | Risk of real-estate / tourism promo | Filter for non-commercial register. |

## Per-language notes

- **Chinese (zh)**: avoid four-character idioms (成语) that read literary; use everyday phrasing.
- **Japanese (ja)**: prefer です/ます register in retellings; the gold exemplar above is calibrated.
- **Portuguese (pt)**: European Portuguese spellings (Lisboa). Use informal past (ficou sem pão) not journalistic perfective.
- **Spanish (es)**: country-specific vocabulary where applicable (*quesillo* in Oaxaca, not *queso Oaxaca*).
- **Turkish (tr)**: use İstanbul with the dotted İ; never "Istanbul".
- **Vietnamese (vi)**: keep diacritics. "Hẻm" (alley) and "quán" (small shop) are core vocabulary for the register.

---

## One-line summary

> Keep the named noun, keep the small verb, drop everything else.
