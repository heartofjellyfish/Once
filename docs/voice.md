# The Once voice

Read this before touching any prompt, UI copy, or rubric that shapes what users read. Everything else in the codebase is plumbing. This is the product.

---

## The principle (human version)

> **Look closely at one ordinary life. Tell one true thing —
> let the facts carry the feeling; don't push it.**
>
> **When the world presses on that life, let the weight show
> sideways, never head-on.**
>
> **If it could open a short story, it's Once. If it's a headline, it's not.**

Three lines, each doing different work:

1. **Default mode** — attention, singular subject, truth, restraint. Any emotion (warmth, humour, sadness, small wonder) is allowed *as long as it arises from the facts*, not from pushed adjectives.
2. **World-presses mode** — when a war, a disaster, a policy upheaval, a shock looms over the life you're writing, don't turn toward it. Find a bounded human moment *within* the event (the mother baking bread during sirens, the trucks carrying rubble, the child reading by candlelight) and describe only that moment.
3. **Judgement test** — novelist-first-line pass, headline-reject. The sharpest test you have.

This principle is compiled into `lib/prompts.ts` and reused across every AI stage. Change it there and the whole pipeline moves together.

---

## The operational rules

### 1. Bounded enough to photograph

One person, one shop, one animal, one object — or a small group acting in one scene at one moment. Never an abstraction ("residents," "the public," "Gen Z," "the market"). If it couldn't fit in a photograph's frame, it's not Once.

### 2. Keep proper nouns, never invent them

Street names, shop names, neighbourhoods, real people, numbers, times — if the source gives them, keep them. If the source doesn't, **do not fabricate**. Better to say "a bakery" than to invent "the bakery on Rua X" when the source only said "a bakery."

### 3. 20–40 words, one or two sentences

In the city's local language (`original_text`). Faithful English (`english_text`); empty when the city is anglophone (the renderer uses this to decide whether to show the translation block).

### 4. No amplifiers

An *amplifier* is anything whose only job is to tell the reader how to feel — adjectives ("shocking," "heart-melting," "stunning"), adverbs ("incredibly," "shockingly," "dramatically"), punctuation ("!", ALL CAPS).

**Self-test**: remove the adjective or adverb. If the sentence still carries the fact, the word was an amplifier — keep it out. If the fact collapses, the word was load-bearing — keep it in.

### 5. Allowed registers

Warmth, humour, small wonder, tenderness, quiet sadness, strangeness, dignity — as long as they **arise from the facts**, not from pushed adjectives. Outside grandmothers dancing at a wedding in Valparaíso can be bright; a cat asleep in a doorway is still; they are both Once.

### 6. No editorial framing, no superlatives, no marketing voice

Forbidden shapes (not specific words — shapes):
- "This shows how..."
- "It raises questions about..."
- "Locals remain resilient..."
- "The best / the most / the never-before-seen..."
- "Exciting news from..."

### 7. The world-presses carve-out

When the source is a war / disaster / political event: do **NOT** summarise the event. Find the bounded human moment within it and describe only that moment. **NEVER** include casualty numbers or damage estimates.

| Bad (headline voice) | Good (Once voice) |
|---|---|
| "Israel strikes Tehran; dozens reported dead." | "After last night, a mosque in Tajrish organised five trucks to carry rubble to a field past the airport; it took until noon." |
| "Torrential rain cripples Tianjin." | "天津的街道积水到膝盖，有人划着充气船穿过红绿灯。" |

---

## Gold exemplars

Pin these in your head.

- *京都の先斗町の小さな喫茶店が今朝十時に開けた。店主は、猫が店の前で眠っていたので、少し遅れたと言った。*
  → A small Pontocho cafe opened at 10 this morning. The owner said he was late because a cat was sleeping in front of the shop.
- *Kalamaja kooli esimese klassi lapsed hilinesid täna pool tundi, sest nende õpetaja ratas sai tühjaks.*
  → Kalamaja first-graders were half an hour late today — their teacher's bike had a flat.
- *A padaria da Rua da Bica ficou sem pão de forma às duas da tarde. O padeiro disse que a entrega da farinha atrasou por causa de obras na avenida.*
  → The Rua da Bica bakery ran out of bread at 2 pm; the baker said flour delivery was late because of roadwork.
- *天津出现强降雨，部分街道积水已到膝盖，有人用充气船在路上划行。*
  → Tianjin flooded to knee level; someone rowed an inflatable boat through the street.
- *The Oaxaca market stall's regular baker didn't open; neighbouring stalls left a single flower at the empty spot.*

What they share: **a verb happened to a specific thing, in a named place, within roughly today.** Nothing more.

---

## Anti-patterns (auto-reject)

| Pattern | Why it fails | Example |
|---|---|---|
| National politics, elections, policy | Scale wrong (country, not street); register wrong (heated) | "PM announces new tax plan" |
| Markets, crypto, earnings, interest rates | Abstract, not a scene | "Bitcoin hits $90k" |
| Lists, opinion, explainers | Not a moment | "5 best ramen shops in Tokyo" |
| Celebrity, royals, pop gossip | Parasocial subject | "Taylor Swift wears red" |
| Casualty / damage reports | Register wrong (body count / $ figures) | "Typhoon kills 14" |
| Breaking news, SHOCKING headlines | Register wrong (sensational) | "BREAKING: massive fire" |
| PR / product launches | A pitch, not a moment | "McDonald's adds new burger" |
| Trend pieces | Wrong scale (zeitgeist, not street) | "AI is reshaping everything" |
| User questions / forum discussions | Wrong form (a question, not a scene) | "Where's good pho in D3?" |
| Vague pastoral | No anchor, could be anywhere | "Spring has come" |
| Too small | No shape, nothing observable | "Someone lost an umbrella" |

---

## Four micro-tests when tuning

1. **Window test** — after reading, do I want to look out my window?
2. **Dinner test** — could I naturally mention this to a friend at dinner tonight?
3. **Screenshot test** — if a friend screenshotted just this sentence, would they understand the scene?
4. **Rest test** — does the sentence *push* emotion, or *rest* on observation? Rest = pass.

---

## City-specific notes

Some feeds drift; this is what to expect and how to counter.

| City | Feed tendency | Correction in prompt |
|---|---|---|
| Tokyo (SoraNews24) | Occasionally overshoots cute / gimmicky | Trust it; it's the benchmark. Filter out pure product tie-ins. |
| Taipei (Taipei Times) | Heavy on politics/economy | Prefilter must reject hard on national-politics cues. |
| İstanbul (Daily Sabah Life) | Lifestyle but occasional nationalism | Strict on register; skip policy-adjacent. |
| Ljubljana (Slovenia Times) | Small country → national reads local | Accept nation-level scenes only if they have a single-subject hook. |
| Antigua (Qué Pasa) | Real-estate / tourism promo risk | Filter for non-commercial register. |

## Per-language notes

- **Chinese (zh)**: avoid four-character idioms (成语) that read literary; everyday phrasing.
- **Japanese (ja)**: prefer です/ます register in retellings.
- **Portuguese (pt)**: European Portuguese spellings (Lisboa). Informal past over journalistic perfective.
- **Spanish (es)**: country-specific vocabulary where applicable (*quesillo* in Oaxaca).
- **Turkish (tr)**: use İstanbul with the dotted İ; never "Istanbul".
- **Vietnamese (vi)**: keep diacritics. "Hẻm" (alley) and "quán" (small shop) are core to the register.

---

## Source rule: no paywalled publications

Paywalled newspapers (The Age, Hindustan Times, NYT, WSJ, The Times)
broadcast a teaser-only RSS where each item is a single hook sentence
crafted to sell a click. The "article content" we receive is editorial
bait, not a summary. Our rewrite can only reshuffle the hook; it
cannot recover the underlying story.

This is a structural mismatch with Once: we need the first two
paragraphs of the body, not the best-of image the sub-editor selected
to provoke. Paywalled sources are **excluded** at the feed level.

If a city has only paywalled coverage, deactivate it and wait for a
better open source. Silence is better than hallucination.

What counts as "paywalled":
- The RSS item consistently comes back as one sentence (<300 chars)
- Clicking the link asks you to subscribe before the second paragraph
- The `content:encoded` in the feed is empty or teaser-only

Acceptable feed register:
- Full-article RSS (SoraNews24, Gothamist, Saigoneer, Atlas Lisboa)
- Publicly funded broadcasters (ABC, BBC local)
- Indie culture magazines (Antigravity, What's on Weibo, Iceland Review)
- Blog RSS (Substack free tier, Ghost, WordPress defaults)

---

## One-line reminder

> **Keep the named noun, keep the small verb, drop everything else.**
