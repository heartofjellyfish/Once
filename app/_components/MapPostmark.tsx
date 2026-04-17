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
  // Stadia enforces a ~308 px minimum width on static maps. If you ask
  // for less (e.g. 180), you silently get 308 wide with your height
  // honoured — which means the returned image is WIDER than tall and
  // CSS scales it down to a short vertical, where the baked-in
  // "©Stamen / ©OpenMapTiles" strip sits neatly inside the crop window.
  // Fix: always request generous dimensions, well above that minimum,
  // with a 2:3 portrait aspect. The square overflow:hidden crop then
  // discards the bottom third, reliably hiding the attribution. The
  // extra resolution also looks crisper on retina displays.
  const mapW = 480;
  const mapH = 720;
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
        <div className="map-crop">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="map" src={src} alt="" />
        </div>
        <div className="labels">
          <div className="city">{city.toUpperCase()}</div>
          <div className="country">{country.toUpperCase()}</div>
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

        /* Container crops bottom attribution via overflow: hidden. Image
           below is rendered at its natural (taller) height; the extra
           portion simply gets clipped. More bulletproof than object-fit
           shenanigans. */
        .stamp .map-crop {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          border-radius: 1px;
        }
        .stamp .map {
          display: block;
          width: 100%;
          height: auto;
          /* Push the watercolor into the page's earthtone palette. Stronger
             than the photo filter because the map has cool blues/greens
             baked in that need more warming to blend. */
          filter: sepia(0.55) saturate(0.65) contrast(0.98) brightness(0.98);
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
          font-size: 6.5px;
          letter-spacing: 0.08em;
          font-weight: 700;
          line-height: 1.12;
          /* Allow up to 2 lines; hide any runover */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: normal;
          hyphens: none;
        }
        .stamp .labels .country {
          font-size: 6px;
          letter-spacing: 0.12em;
          opacity: 0.75;
          margin-top: 2px;
          line-height: 1.1;
        }

      `}</style>
    </a>
  );
}
