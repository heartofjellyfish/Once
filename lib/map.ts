/**
 * Map URL builders — Stamen Watercolor (via Stadia Maps) + a link target.
 *
 * We use Stadia's domain authentication, configured in the Stadia dashboard
 * to accept requests from once.qi.land and localhost. The api_key is *not*
 * embedded in the URL because it would end up in the page's HTML source.
 *
 * If STADIA_API_KEY is set we append it *only* when the deployment isn't
 * running on the canonical domain (Vercel preview URLs, etc.) — this is
 * a safety net so previews still render maps.
 */

interface MapOpts {
  size?: number;   // pixels (square); Stadia returns @2x so CSS size is halved
  zoom?: number;   // 0–20; ~11 is good for a city neighbourhood
}

function base(lat: number, lng: number, { size = 200, zoom = 11 }: MapOpts = {}) {
  // Stadia's static map API: /static/{style}.jpg?center=lat,lng&zoom=N&size=WxH
  // (Note lat first — unlike Mapbox/Google which use lng,lat. Wrong order
  // gives HTTP 400 "Unable to parse query argument center".)
  // @2x suffix on size is not supported and causes 422; request the pixel
  // size directly and let CSS scale.
  return `https://tiles.stadiamaps.com/static/stamen_watercolor.jpg?center=${lat},${lng}&zoom=${zoom}&size=${size}x${size}`;
}

/** Watercolor map URL. api_key is added only in non-production envs. */
export function watercolorMapUrl(
  lat: number,
  lng: number,
  opts?: MapOpts
): string {
  const url = base(lat, lng, opts);
  const key = process.env.STADIA_API_KEY;
  // On production (VERCEL_ENV=production) the request comes from once.qi.land
  // and domain auth handles it. On previews the domain won't match, so fall
  // back to the api_key. Locally VERCEL_ENV is undefined and Stadia auto-
  // allows localhost, so no key needed either.
  if (key && process.env.VERCEL_ENV === "preview") {
    return `${url}&api_key=${encodeURIComponent(key)}`;
  }
  return url;
}

/** A regular Google Maps search link to open when the postmark is clicked. */
export function googleMapsLink(
  lat: number,
  lng: number,
  place: string
): string {
  const q = encodeURIComponent(`${place}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=&ll=${lat},${lng}`;
}
