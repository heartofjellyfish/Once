import { watercolorMapUrl, googleMapsLink } from "@/lib/map";

interface Props {
  lat: number;
  lng: number;
  city: string;
  country: string;
  width?: number;
}

/**
 * Rectangular postage stamp with Stamen Watercolor art, city/country
 * caps below, and a small script "Once" denomination. Clicks to
 * Google Maps.
 *
 * Perforated edges removed for reliability — the CSS mask-composite
 * approach was fragile across browsers. A clean rectangle with a thin
 * inner border reads convincingly enough as a stamp.
 */
export default function MapPostmark({
  lat,
  lng,
  city,
  country,
  width = 92
}: Props) {
  const height = Math.round(width * 1.22);
  // Request 2x pixels for retina, display at CSS width. Ask for a taller
  // image than we display — we'll crop the bottom 14% in CSS to hide the
  // Stamen/OpenMapTiles attribution that Stadia bakes into the JPG.
  // Attribution is shown on /about instead.
  const mapW = (width - 18) * 2;
  const mapH = Math.round(mapW * 1.18);
  const src = watercolorMapUrl(lat, lng, { size: mapW, height: mapH, zoom: 12 });
  const link = googleMapsLink(lat, lng, `${city}, ${country}`);

  return (
    <a
      className="stamp"
      href={link}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${city}, ${country} in Google Maps`}
      style={
        {
          "--w": `${width}px`,
          "--h": `${height}px`
        } as React.CSSProperties
      }
    >
      <div className="inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="map"
          src={src}
          alt=""
          width={mapW}
          height={mapH}
        />
        <div className="labels">
          <div className="city">{city.toUpperCase()}</div>
          <div className="country">{country.toUpperCase()}</div>
        </div>
        <div className="denom" aria-hidden="true">
          <em>Once</em>
        </div>
      </div>

      <style>{`
        .stamp {
          position: relative;
          display: inline-block;
          width: var(--w);
          height: var(--h);
          padding: 3px;
          text-decoration: none;
          color: inherit;
          /* Same paper tone as the Polaroid so the two objects read as
             being from the same pile. */
          background: #f7f0dc;
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.22  0 0 0 0 0.15  0 0 0 0 0.07  0 0 0 0.12 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E"),
            linear-gradient(168deg, #f9f2de 0%, #ebe0c4 100%);
          background-blend-mode: multiply, normal;
          border-radius: 2px;
          box-shadow:
            0 1px 0 rgba(32, 23, 8, 0.05),
            0 10px 20px -12px rgba(42, 23, 8, 0.22),
            inset 0 0 0 0.5px rgba(107, 50, 32, 0.18);
          transform: rotate(-3.5deg);
          transition: transform 420ms cubic-bezier(0.2, 0.8, 0.25, 1);
        }
        .stamp:hover,
        .stamp:focus-visible {
          transform: rotate(-1.5deg) translateY(-1px);
        }

        .stamp .inner {
          position: relative;
          width: 100%;
          height: 100%;
          padding: 2px;
          display: flex;
          flex-direction: column;
          align-items: center;
          border: 0.5px solid rgba(107, 50, 32, 0.35);
          border-radius: 1px;
        }

        .stamp .map {
          display: block;
          width: 100%;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          object-position: center top;
          /* Push the watercolor into the page's earthtone palette. Stronger
             than the photo filter because the map has cool blues/greens
             baked in that need more warming to blend. */
          filter: sepia(0.55) saturate(0.65) contrast(0.98) brightness(0.98);
          border-radius: 1px;
        }

        .stamp .labels {
          margin-top: 3px;
          text-align: center;
          font-family: var(--serif);
          font-variation-settings: "opsz" 144, "wght" 700;
          color: var(--accent-dark);
          line-height: 1.08;
        }
        .stamp .labels .city {
          font-size: 7.5px;
          letter-spacing: 0.18em;
          font-weight: 700;
        }
        .stamp .labels .country {
          font-size: 6.5px;
          letter-spacing: 0.18em;
          opacity: 0.75;
          margin-top: 1px;
        }

        .stamp .denom {
          position: absolute;
          top: 2px;
          right: 3px;
          font-family: var(--cursive);
          font-size: 11px;
          color: var(--accent-dark);
          line-height: 1;
          opacity: 0.85;
        }
        .stamp .denom em { font-style: italic; }
      `}</style>
    </a>
  );
}
