# Place-card subsystem

Handoff doc for any session touching the place info shown on a Once story card — currency, milk/eggs price, weather, location summary, timezone, local time. Pair with `CLAUDE.md` (voice, workflow) and `docs/voice.md` (register).

---

## What the reader sees

On each unfolded story card, above (or beside) the rewrite, there's a small "place block":

```
Tokyo · Saturday
TOKYO · JAPAN
Tokyo · 07:00 · 16°C · mist
Japan's capital on Tokyo Bay, ~14 million people
— · —
milk · 1l        ¥7
eggs · dozen     ¥30
CNY              ~$0.93 · ~$4.25
```

Seven pieces of information, all small. Together they set the scene — you're in a real place with real prices and real weather, at a real hour of someone's day. None of them is the story; all of them frame it.

## Where each field comes from

| Field | Source | File |
|---|---|---|
| `city` name + region + country | `cities` table (seeded) or AI geocode | `lib/cityResolver.ts` |
| `lat` / `lng` | `cities` table | seed or geocode |
| `timezone` (IANA) | `cities` table | seed or geocode |
| `local_hour` (0-23) | scoring pass infers from article phrasing | `lib/pipeline.ts` |
| `weather_current` label | OpenWeather API | `lib/weather.ts` |
| `original_language` / `currency_code` / `currency_symbol` | `cities` table | seed or geocode |
| `milk_price_local` / `eggs_price_local` | AI geocode at first sighting | `lib/cityResolver.ts` |
| `milk_price_usd` / `eggs_price_usd` | same | same |
| `location_summary` | AI geocode, free-text "one evocative sentence" | `lib/cityResolver.ts` |
| `prices_updated_at` | timestamp of last AI geocode | `cities.prices_updated_at` |

## The design rule

**Each field has a deterministic source. The AI writes sentences, not facts.** City metadata comes from the `cities` table; weather from the API; prices from a **per-city** geocode cached on the row, not per-story. The AI's job is to resolve unfamiliar free-text into a canonical row (first time you name a city), then render a voice-shaped `location_summary`. It never guesses currency/timezone/lat per-story.

This means:
- If you rename "Seoul" to "서울" in the display, you don't re-call the API.
- Prices get cached once per city (not regenerated per story).
- Every row in `cities` carries a full snapshot.

## Files

```
lib/cityResolver.ts   free-text city → canonical cities row.
                      DB lookup first (by id / name / aliases,
                      case-insensitive). If unknown, gpt-4o-mini
                      geocodes and inserts a new row with
                      is_active=false (so RSS cron doesn't poll
                      it) but fully-populated metadata + prices.
lib/weather.ts        OpenWeather "Cloudy, 18°C" label. Returns
                      null on error — weather is nice-to-have.
lib/format.ts         formatLocal() — price rendering rules (no
                      decimals for JPY/KRW/VND/etc.; symbol
                      placement by currency)
lib/enrich.ts         enrichAndPublish ties it all together:
                      resolve city → parallel(weather, photo) →
                      insert to stories
```

## City-geocode prompt (where location_summary gets its voice)

Lives in `lib/cityResolver.ts`. The AI returns these fields on first sighting of a new city:

```
canonical_name   "Ho Chi Minh City" for "HCM", etc.
country, region, timezone, lat, lng
currency_code + currency_symbol + original_language (ISO 639-1)
location_summary  ONE short evocative sentence in Once's voice
milk_price_local / eggs_price_local / milk_price_usd / eggs_price_usd
```

`location_summary` is the only field that carries register. The prompt asks for:
> "ONE short, evocative sentence in Once's voice describing the city's scale and location. No superlatives. Examples: 'a colonial mountain city in southern Mexico, ~275k people', 'Japan's capital on Tokyo Bay, ~14 million people', 'a district in northern China of ~1M people'."

## Reviewer's aesthetic

The place-card should feel like **a margin of a letter, not a dashboard**. Whispers of texture, not metrics.

- **Location summaries should carry scale + geography + one texture.** "Tokyo's capital on Tokyo Bay, ~14 million people" ✓. "Tokyo, a global city" ✗. "an Arctic Circle city of ~78k people; polar nights and Sami country" ✓.
- **Prices should feel calm, not financial.** We don't use `Intl.NumberFormat`'s currency mode — it nudges toward a trading-app register. `formatLocal` rounds to the currency's natural decimals and picks symbol placement carefully (kr, zł, Kč, Ft, 元 et al. go AFTER; most go before).
- **Weather is one phrase.** "Mist, 16°C". Not a forecast. Not multiple readings. One snapshot.
- **Local time is an hour, not a minute.** "07:00" not "07:42" — the point is rhythm, not precision.

## Known issues

- **Prices are AI-estimated once**, then cached in `cities.prices_updated_at`. There's no auto-refresh. Over time the cached prices drift. Refresh policy is TODO.
- **Prices for some currencies feel off** — the scorer sometimes writes 0 when uncertain, which renders as "¥0" on the card. Should fall back to hide the price row entirely when zero.
- **`location_summary` is inherited from the first-sighting geocode.** If the prompt changes, existing rows don't get re-summarized. There's no reseed-location-summaries-only script (would be cheap to add).
- **Some cities (like Tianjin) were seeded without the newer columns** (milk_price_local etc.) and need a geocode-style backfill on first RSS ingest. The seed script does NOT generate prices for the 36 seeded cities — they default to 0. Prices are only AI-populated for cities discovered via `/admin/compose` → `cityResolver.resolveCity()`.
- **Display bug candidates**: when prices are 0, the card shows "¥0" next to currency. Hide the row or show "—".

## Potential improvements (for the place-card session)

Ordered by leverage:

1. **Hide zero-price rows.** 30-minute fix in `app/page.tsx` renderer. Currently every card shows milk+eggs+USD even when all zero.
2. **Backfill prices for seeded cities.** Script that calls the geocode on each row where `milk_price_local IS NULL OR milk_price_local = 0` and fills it. ~1h.
3. **Refresh policy for prices.** If `prices_updated_at` > 6 months old, re-geocode on next ingest. ~30min.
4. **Richer location_summary.** Right now it's scale + geography + maybe one texture. Could be three textures with line breaks, more like a letterhead. Needs voice.md alignment first.
5. **Multi-layer place info.** Above the rewrite: city + weather. Below the rewrite: currency + prices + location_summary. The current single block is dense; two blocks could breathe better.
6. **Per-source-language prices/currency.** If the story is in a city where the local currency is in decline (Lebanon, Venezuela, Zimbabwe), an extra line showing "in parallel dollars" would add texture. Niche.
7. **Local hour → local clock-shape.** Right now `07:00` is an abstract number. A typographic twist — "early" / "evening" / "lunchtime" — might fit the letter-margin aesthetic better. Ask the reviewer.

## Where NOT to touch

- `lib/pipeline.ts`'s scoring/rewrite pass — that's the voice subsystem, not place-card. Touch via `docs/voice.md` instead.
- `cities` table schema — migrations ripple across seed + admin actions; coordinate with data model changes in `db/schema.sql` + `app/admin/sources/actions.ts` + `scripts/seed-cities.mjs`.
- The envelope postmark — that's the photo subsystem (`docs/photo.md`).

## Related decisions already made

- **Prices come from cities, not per-story.** Early prompt asked the AI to guess prices each time; user rejected this as "asking the AI to invent 17 fields per story." Now canonicalized.
- **No exchange-rate API.** The AI estimates USD directly in the city geocode. Cheaper, good enough for "a margin texture."
- **Temperature in Celsius only.** Cursor over the weather label doesn't show Fahrenheit. If a US reader complains, add a toggle.
- **Seven languages have hand-tuned number-of-decimals rules** in `format.ts`. Extend carefully.
