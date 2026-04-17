import { watercolorMapUrl, googleMapsLink } from "@/lib/map";

interface Props {
  lat: number;
  lng: number;
  city: string;
  country: string;
  width?: number;
}

/**
 * Classic rectangular postage stamp with Stamen Watercolor as the image
 * and city / country in small caps at the bottom. Clicks to Google Maps.
 *
 * The perforated edge is drawn via an SVG mask — a small semicircle
 * repeated along each border. Works in Chrome, Safari, Firefox.
 */
export default function MapPostmark({
  lat,
  lng,
  city,
  country,
  width = 92
}: Props) {
  const height = Math.round(width * 1.25); // classic 4:5 stamp proportion
  const mapSize = width - 18;
  const src = watercolorMapUrl(lat, lng, { size: mapSize, zoom: 10 });
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
      <div className="paper">
        <div className="inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="map" src={src} alt="" width={mapSize} height={mapSize} />
          <div className="labels">
            <div className="city">{city.toUpperCase()}</div>
            <div className="country">{country.toUpperCase()}</div>
          </div>
          <div className="denom" aria-hidden="true">
            <em>Once</em>
          </div>
        </div>
      </div>
      <style>{`
        .stamp {
          position: relative;
          display: inline-block;
          width: var(--w);
          height: var(--h);
          transform: rotate(-3.5deg);
          transition: transform 420ms cubic-bezier(0.2, 0.8, 0.25, 1);
          filter: drop-shadow(0 6px 10px rgba(42, 23, 8, 0.22));
        }
        .stamp:hover,
        .stamp:focus-visible {
          transform: rotate(-1.5deg) translateY(-1px);
        }

        /* Perforated edge: a white paper rect whose mask cuts small half-
           circles out of all four sides. */
        .stamp .paper {
          position: absolute;
          inset: 0;
          background: #fbf4e2;
          /* Teeny warm grain on the stamp paper */
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.17  0 0 0 0 0.09  0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E"),
            linear-gradient(170deg, #fdf7e6 0%, #f2e8cf 100%);
          background-blend-mode: multiply, normal;

          /* perforated edge: semicircles punched out of each side */
          -webkit-mask:
            radial-gradient(circle at 4px 6px, transparent 2.6px, #000 3px) 0 0 / 8px 12px repeat-x,
            radial-gradient(circle at 4px calc(100% - 6px), transparent 2.6px, #000 3px) 0 100% / 8px 12px repeat-x,
            radial-gradient(circle at 6px 4px, transparent 2.6px, #000 3px) 0 0 / 12px 8px repeat-y,
            radial-gradient(circle at calc(100% - 6px) 4px, transparent 2.6px, #000 3px) 100% 0 / 12px 8px repeat-y,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: source-in;
          mask:
            radial-gradient(circle at 4px 6px, transparent 2.6px, #000 3px) 0 0 / 8px 12px repeat-x,
            radial-gradient(circle at 4px calc(100% - 6px), transparent 2.6px, #000 3px) 0 100% / 8px 12px repeat-x,
            radial-gradient(circle at 6px 4px, transparent 2.6px, #000 3px) 0 0 / 12px 8px repeat-y,
            radial-gradient(circle at calc(100% - 6px) 4px, transparent 2.6px, #000 3px) 100% 0 / 12px 8px repeat-y,
            linear-gradient(#000 0 0);
          mask-composite: intersect;
        }

        .stamp .inner {
          position: absolute;
          inset: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2px;
          border: 0.5px solid rgba(107, 50, 32, 0.35);
        }

        .stamp .map {
          display: block;
          width: 100%;
          height: auto;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          filter: sepia(0.1) saturate(0.9) contrast(1.02) brightness(0.97);
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
          top: 3px;
          right: 4px;
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
