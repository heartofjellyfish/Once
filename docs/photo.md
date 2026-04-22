# Photo subsystem

Handoff doc for any session touching the hero image on a Once story card. Pair with `CLAUDE.md` (voice, reader's-side test, workflow rules) and `docs/voice.md` (register bible).

---

## Where photos live

Every published story has **one hero image** rendered above the text, and **one watercolor "stamp"** rendered as a postmark on the envelope before unfold. Both come through the same resolution chain.

| Field | Source | Stored in |
|---|---|---|
| `photo_url` | resolveHeroImage() at publish time | `stories.photo_url` |
| envelope stamp | `watercolorMapUrl(lat, lng, small)` at render | computed on the fly |

## Current resolution chain (`lib/ogImage.ts` → `resolveHeroImage`)

1. **OG scrape** — fetch the source article's `<head>` (capped at 400KB), pick the best `og:image` / `twitter:image` / `twitter:image:src` / `og:image:secure_url`. Size hints from `og:image:width|height` inform a score. Obvious logos rejected via `LOGO_PATTERNS` regex (`logo`, `favicon`, `og-default`, `site-icon`, `placeholder`, `default-image`, `apple-touch`). Hosts known to serve stocky/press OG (see `OG_SKIP_HOSTS` in `lib/ogImage.ts` — currently `nippon.com`) are skipped entirely. Update that set as more bad sources show up.
2. **Vision judge on OG** (`lib/photoVision.ts`) — when OG returns something, Haiku 4.5 scores it 0–10 on "documentary/ordinary moment vs stock/press/corporate". Below threshold (default 5), we discard the OG image and fall through to Unsplash. Prompt caches the system block so repeated calls in a run stay cheap (~$0.003/call). If `ANTHROPIC_API_KEY` is unset or the call errors, we keep the OG image (no regression).
3. **Unsplash keyword search** (`lib/unsplash.ts`) — when OG is missing or rejected by the vision judge. Query is built by `lib/photoKeywords.ts`: gpt-4o-mini pulls the single most photographable noun from the rewrite, appended to the city name (e.g. "Old Bazaar Skopje"). Bakeoff vs. Openverse / Pexels / Pixabay showed Unsplash has the most on-brand film/documentary aesthetic. License permits no-attribution use; crediting is a future upgrade.
4. **Watercolor map fallback** — when Unsplash returns nothing or no keyword was extractable. Stamen Watercolor static map centered on the story's lat/lng at zoom 12 via Stadia Maps (`lib/map.ts` → `watercolorMapUrl`). 720×480 for hero, smaller for stamp. On-brand with the envelope aesthetic.
5. **Last-resort picsum** — `https://picsum.photos/seed/{slug}/1200/900`, deterministic per story. Only fires when OG, Unsplash, and lat/lng all fail.

**Reviewer override** — the `/admin` pending card shows the current hero thumbnail. The "reroll photo" button (`rerollPhotoAction` in `app/admin/actions.ts`) re-runs the chain with `forceSkipOg=true`, so OG is bypassed and Unsplash / watercolor / picsum is tried fresh. Unsplash returns are non-deterministic so repeated clicks give different results.

Fallbacks never throw — `resolveHeroImage()` always returns a string URL.

All hero images render through a unified CSS filter in `app/page.tsx` (`sepia(0.35) saturate(0.78) contrast(0.97) brightness(0.97)`) — pulls stocky OG images and naturalistic Unsplash photos into a shared warm palette.

## Security rules (non-negotiable)

- **Never scrape faces.** If facial-detection becomes relevant, gate scraping on it. This is already noted in the global `harmful_content_safety` constraints, but the photo subsystem is where it'd bite first.
- **No user-agent spoofing** except the polite `OnceBot/1.0` declaration (which is honest — we are a bot).
- **Respect robots.txt** — right now we only read `<head>` (not article text), so for current behavior this isn't tight. Any upgrade that scrapes bodies or proper images must revisit.
- **Don't embed `STADIA_API_KEY` in the page HTML.** `map.ts` appends the key only for non-canonical hosts (preview URLs); on once.qi.land production it relies on Stadia's domain-authentication whitelist.

## Files

```
lib/ogImage.ts     OG candidate extraction + scoring + fallback chain
lib/map.ts         Stadia watercolor URL builder
                   (both the hero-size and the small stamp)
```

Also referenced by:
- `lib/pipeline.ts` → `writeQueue` calls `resolveHeroImage` when putting candidates in moderation_queue
- `lib/enrich.ts` → `enrichAndPublish` uses the queue's photo_url or resolves fresh

## Reviewer's aesthetic so far

- **Watercolor maps work.** On-brand, calm, abstract enough to avoid the stock-photo look.
- **Real article photos** from mainstream feeds tend to be stocky (press-release headshots, generic editorials). The scoring/logo rejection filters help but the baseline real-photo is often uninspiring.
- **What hasn't been tried**: AI-generated illustrations, hand-illustrated stamps per city, user-uploaded photos, Flickr Creative Commons search by city.

## Known issues

- **OG images on paywalled sites** often return a paywall-hero or a generic promo image — low signal. Pair with "no paywalled sources" rule in `docs/voice.md`.
- **Some feeds use `<enclosure>` or `media:content`** inside RSS, which we currently don't parse. Could be a cheap upgrade: `lib/sources.ts` → surface the enclosure URL, pass it to `resolveHeroImage` as a pre-OG candidate.
- **No second photo.** Stories have one hero. Some stories (Metropolitan Diary shape — multiple micro-moments) might benefit from a gallery; current UI doesn't support that.
- **No photo review in /admin.** The reviewer can't see or override the hero before approving. They can edit it on a published story via `/admin/story/[id]` but not mid-review. A "swap photo" action on pending cards would be worth building.

## Potential improvements (for the photo session)

Ordered by leverage:

1. **Review-time photo swap** — add a button on the `/admin` pending card to regenerate (try OG again, or force watercolor). ~1h.
2. **RSS enclosure support** — check feeds' `<enclosure>` / `media:content` / `media:thumbnail` before falling back to OG scrape. ~30min.
3. **Flickr CC search fallback** — when OG fails and watercolor feels wrong (e.g. story is about one specific scene, not the city at large), query Flickr CC for tagged city images. Needs API key; risks low-quality matches.
4. **AI-generated illustrations** per story — very on-brand with the watercolor look, but cost and provenance questions. Consider a hand-curated illustration library indexed by city + theme.
5. **Attribution footer** — right now OG scraped images carry no credit in the rendered page. Copyright-wise risky if the image is a stock-photo-service-licensed asset. Consider attribution strings or restrict hero to CC sources.
6. **Face detection filter** — if the image contains a real human face, prefer an alternative (watercolor). Matches the editorial register of "ordinary moments, not celebrity".

## Related decisions already made

- **SoraNews24 OG images are often good** (Japanese quirky scenes) → keep.
- **Nippon.com OG images are often stock** → lean toward watercolor for Nippon-sourced stories.
- **The Age / paywalled Aussie/NYT sources** → excluded at the source level; photo pipeline not affected.
- **Daily Maverick and similar long-form** → variable OG quality; the scoring chain handles it.

## Where NOT to touch

- `app/page.tsx` envelope rendering — style fixed, changes there are voice/design work, not photo-pipeline.
- `lib/slogan.ts` — unrelated (envelope tagline).
