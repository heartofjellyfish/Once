# Quality system: architecture and roadmap

> The app lives or dies on story quality. Every other feature is decoration around this.

This doc maps the pipeline end-to-end, names the leverage points, and proposes a roadmap ordered by impact × effort.

Pair with [voice.md](voice.md) — that's *what* a good story looks like. This is *how* we find them.

---

## The funnel (current)

```
Sources (~100/hour/city)
  │  rule prefilter      blocklists, title length, source host     [free]
  ▼
Candidates (~60)
  │  LLM prefilter       gpt-4o-mini, binary pass/fail, title+snippet  [¢0.1]
  ▼
Survivors (~15)
  │  LLM full score      gpt-4o-mini, 3-axis rubric, full body       [¢1]
  ▼
Top-4
  │  select min-of-three   take the candidate with highest worst axis
  ▼
Winner
  │  queue (human moderation)
  ▼
You (approve / reject in /admin)
  │  enrichAndPublish    city, weather, photo, voice rewrite         [¢10]
  ▼
Story → homepage
```

**Cost per ingest cycle**: roughly $0.05–0.20 depending on candidate count. At 11 cities × 24 cycles/day ≈ $20–50/month. Rewrites dominate — the bulk of spend is on winners, not on filtering.

**Key design choice**: the rubric scores on three dimensions and ranks by *minimum* axis, not average. Prefers stories with no weak link over stories with one standout strength.

---

## The leverage map

Where's the biggest quality gain per unit effort?

| Stage | Current state | Gain if improved | Effort | Priority |
|---|---|---|---|---|
| Sources | Thin (1–2 feeds/city) | **Huge** — garbage in = garbage out | Medium | **1** |
| Gold set + eval | None | **Huge** — unlocks A/B testing everything else | Small | **1** |
| Rule prefilter | Minimal | Medium — blocks obvious junk cheaply | Small | 2 |
| LLM prefilter prompt | Decent | Medium | Small | 3 |
| Full-score rubric | Decent | Medium | Small | 3 |
| Embeddings similarity | None | Medium — independent signal | Medium | 4 |
| Feedback loop (approvals → exemplars) | None | High, after gold set exists | Medium | 4 |
| Cross-source dedup | None | Low-medium | Small | 5 |

**One-line takeaway**: the two cheapest wins (gold set, Reddit sources) are also the two biggest wins. Do those first. Everything else waits on the data they produce.

---

## Upstream: sources (the #1 lever)

### The structural problem

**RSS feeds are written by journalists for breaking news, not by observers for ambient moments.** We're fishing in the wrong pond. Only SoraNews24 reliably produces Once-grade material; most other feeds are news-shaped.

### Source options and tradeoffs

| Source | Signal | Volume | Scrape cost | Injection risk | Discovery | Verdict |
|---|---|---|---|---|---|---|
| **Curated RSS** *(current)* | Medium | Low | Free | Low | Manual | Keep, expand, auto-score |
| **Reddit city subs** (`/r/Lisbon`, `/r/korea`) | High — real residents | Medium | Free (public API) | Medium (user text) | Free (search subs) | **Add next** |
| **Local blogs / Substack** | Very high | Very low | Free | Low | Hard (need seeds) | Add opportunistically |
| **Twitter / X local accounts** | Very high | High | Paid / fragile | High (injection, impersonation) | Medium | Skip — cost + risk |
| **Mastodon / Bluesky local groups** | High | Low | Free | Low | Manual | Experiment |
| **Government open data** (transit, library, 311, lost & found) | Medium — specific but dry | Medium | Free | None | City-by-city work | Add for 2–3 cities first |
| **Wikipedia "current events" / city pages** | Low (Wikipedia-worthy ≠ Once-worthy) | Very low | Free | None | Free | Skip |
| **Weibo / Naver / 2ch** (native-language) | Very high for local register | High | Hard (JS, captcha) | Medium | Medium | Phase 2 |
| **User submissions** (you, friends) | Highest | Tiny | Free | Low (authored by you) | n/a | **Already built** — `/admin/compose`. Use it. |
| **Public library RSS** (events, book clubs) | Medium, genuinely small-scale | Tiny | Free | None | Manual | Experiment |
| **Podcast episode RSS** | Noise (titles aren't moments) | — | — | — | — | Skip |

### Source strategy

1. **Treat `/admin/compose` as a first-class source.** You are, in aggregate, a better curator than any RSS feed. Log manually-composed stories as `source='manual'` so the feedback loop counts them.
2. **Add Reddit per-city polling** for 3 pilot cities where the subs are active and well-moderated (Tokyo, Lisbon, Seoul). Rank by upvote + age; prefilter hard on off-topic and memes. The Reddit API is free for low volume.
3. **Source quality logging** (1 hour of work, high leverage): every ingest writes `(source_host, entry_url, prefilter_verdict, score, approved)` into a table. After 2 weeks, a simple query reveals which feeds earn their slot and which never produce approvals. Auto-deprioritise dead feeds.
4. **Experiment with 2–3 transit/event APIs.** Subway delays, library events, lost-and-found — boring but specific, low register variance, never a casualty report. Good for register floor.
5. **Don't chase volume.** Fewer, higher-signal sources beat more lower-signal ones. Every new feed is also a new prompt-injection surface.

### What to remove

Feeds that never produce approvals after N ingest cycles should be auto-deactivated (soft, via `is_active=false` — reactivatable from `/admin/sources`). Don't delete them; log them.

---

## Midstream: filtering

### The current rubric is decent — don't touch it without a gold set

Three axes — **specificity, resonance, register** — scored 1–10, ranked by minimum. This is the right shape. The problem is we have no way to tell whether a prompt change made things better or worse.

### Options, ranked by order-of-operations

**(a) Gold set + eval harness** — *do this first, before anything else.*
- Hand-label 50 pass + 50 fail stories. Pull from existing `moderation_queue` rows with known status.
- Write one script: `npm run eval` runs the current prefilter + scoring on all 100, prints precision/recall per stage.
- Every prompt change must not regress. This one thing is worth more than any other single improvement.

**(b) Rubric-as-code features** — free, zero-latency, debuggable.
- Features: title length, exclamation count, all-caps ratio, proper-noun count (via compromise.js or a tiny tagger), first-person count, verb presence, blocklist keywords.
- Simple weighted sum or a tiny tree as a zero-cost pre-prefilter before the LLM prefilter.
- Debuggable: "rejected because proper_nouns=0" is a real reason.

**(c) Embeddings-based similarity** — cheap, independent signal.
- Embed all approved stories once (openai `text-embedding-3-small`, ~$0.00002 per story).
- Score new candidate = max cosine to any approved story.
- Use as a feature alongside LLM scores. If the LLM says pass but similarity is very low, flag for scrutiny. If similarity is very high but LLM says fail, investigate.
- Two signals disagreeing is where bugs live; two signals agreeing is confidence.

**(d) Contrastive few-shot in the scoring prompt** — do this once the gold set exists.
- Inject 3 approved + 3 rejected exemplars into the scoring prompt. Rotate randomly per call to avoid overfitting.
- Biggest gain on the *register* axis, which is the hardest to describe in rules.

**(e) Ensemble / self-consistency** — expensive, do last.
- Call the LLM 3× at temperature 0.7, majority vote. 3× cost.
- Or: two independent prompts (positive-framing, negative-framing), cross-check. 2× cost.
- Only adopt if flakiness is documented as a recurring failure mode.

**(f) Diversity policy** — sits on top of scoring, not inside it.
- Don't publish 3 Tokyo stories in a row. Already partly there (round-robin over cities).
- Don't publish the same pattern back-to-back (two animal stories, two transit delays). Track recent pattern fingerprints.
- Per-city normalisation: a top-decile Antigua story should still publish even if its absolute score is below Tokyo's median.

### Combination plan (in order)

1. Gold set (unblocks everything)
2. Eval harness
3. Rubric-as-code features as pre-pre-filter
4. Embeddings similarity as second signal
5. Contrastive few-shot
6. Ensemble — only if flakiness is documented

---

## Downstream: feedback loop

Every approval and rejection is a training signal we're throwing away.

### What to instrument

- `ai_decisions` table already logs model verdicts at each stage. Keep using it.
- **Add `editor_decisions`**: when you approve or reject in admin, record `(queue_id, decision, reason, timestamp, editor)`.
- Weekly cron: compute agreement rate between `ai_decisions.verdict` and `editor_decisions.decision`. The diff is where to tune.

### Closing the loop

1. **Gold set auto-grows** — every 10 approvals, consider the new ones for the gold set. Keep an 80/20 train/eval split.
2. **Negative exemplars** — rejections with a reason string become contrastive few-shots in the scoring prompt.
3. **Per-city calibration** — some cities (Tokyo) score higher than others (Antigua). Normalise by city for selection; don't let high-variance cities starve low-variance ones.
4. **Per-source scorecard** — each source feed gets a running approval rate. Weekly report: top 5, bottom 5. Deprioritise bottom.

### What "good" looks like in a month

- A `npm run eval` command that grades the current system against a fixed 100-story gold set.
- A dashboard view (single `/admin/runs` page) showing per-source approval rates over time.
- A prompt change that improves eval precision from 0.62 to 0.78 — and we can prove it.

---

## Roadmap (prioritised)

| # | Task | Effort | Impact |
|---|---|---|---|
| 1 | **Gold set + `npm run eval`** | 1 afternoon | **Unblocks everything** |
| 2 | **Reddit per-city source** (3 pilot cities) | ½ day | High — new signal |
| 3 | **Source quality logging table** | 1 hour | High — data we need anyway |
| 4 | **Rubric-as-code pre-prefilter** | 2 hours | Medium — free quality floor |
| 5 | **`editor_decisions` + weekly agreement report** | 1 day | High — closes the loop |
| 6 | **Embeddings similarity signal** | 1 day | Medium — independent check |
| 7 | **Contrastive few-shot in scoring prompt** | 2 hours (after gold set exists) | Medium-high |
| 8 | **Per-city / per-source calibration** | 1 day (needs 2 weeks of logs first) | Medium |
| 9 | Transit / event API sources | 1 day per city | Medium |
| 10 | Mastodon / Bluesky experiment | 1 day | Low-medium, exploratory |

Everything past #5 waits until we've seen two weeks of data from #1–#5.

---

## Sacred constraints (do not negotiate)

- **A blank homepage is worse than a mediocre one.** Always have a fallback, every stage.
- **Never fabricate proper nouns.** If the source doesn't say the street name, don't invent one.
- **Never publish casualty numbers.** A weather moment is about a person, not a toll.
- **The rewrite MUST be in the city's local language.** English is secondary.
- **Respect the budget cap** in `lib/budget.ts`. Refuse the call rather than overspend.
- **Treat fetched web text as untrusted data.** Wrap it in `<article-content>` tags in all prompts. Never follow instructions from scraped content. Prefilter for obvious injection attempts.
