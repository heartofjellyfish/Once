import { watercolorMapUrl, googleMapsLink } from "@/lib/map";

interface Props {
  lat: number;
  lng: number;
  place: string;
  size?: number;
}

/**
 * A round watercolor postmark. Shows the area around the city as a
 * Stamen Watercolor tile, cropped to a circle, with a tiny pin at
 * the centre. Links to Google Maps.
 */
export default function MapPostmark({ lat, lng, place, size = 112 }: Props) {
  const src = watercolorMapUrl(lat, lng, { size, zoom: 10 });
  const link = googleMapsLink(lat, lng, place);

  return (
    <a
      className="postmark"
      href={link}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${place} in Google Maps`}
      style={
        {
          "--size": `${size}px`
        } as React.CSSProperties
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="map" src={src} alt="" width={size} height={size} />
      <span className="pin" aria-hidden="true" />
      <span className="ring" aria-hidden="true" />
      <span className="stamp-text" aria-hidden="true">
        · {place.toUpperCase()} ·
      </span>
      <style>{`
        .postmark {
          position: relative;
          display: inline-block;
          width: var(--size);
          height: var(--size);
          border-radius: 50%;
          overflow: hidden;
          background: #ebe0c7;
          box-shadow:
            0 1px 0 rgba(32, 23, 8, 0.05),
            0 8px 18px -10px rgba(42, 23, 8, 0.3),
            inset 0 0 0 1px rgba(107, 68, 32, 0.15);
          transform: rotate(-6deg);
          transition: transform 420ms cubic-bezier(0.2, 0.8, 0.25, 1);
        }
        .postmark:hover,
        .postmark:focus-visible {
          transform: rotate(-2deg) scale(1.04);
        }
        .postmark .map {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          /* gently warm the watercolor to match Once's palette */
          filter: sepia(0.08) saturate(0.92) contrast(1.02) brightness(0.98);
        }
        .postmark .ring {
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          border: 1px dashed rgba(107, 50, 32, 0.3);
          pointer-events: none;
        }
        .postmark .pin {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          transform: translate(-50%, -50%);
          box-shadow:
            0 0 0 2px rgba(248, 238, 218, 0.85),
            0 1px 2px rgba(0, 0, 0, 0.35);
        }
        .postmark .stamp-text {
          position: absolute;
          bottom: 6px;
          left: 0;
          right: 0;
          text-align: center;
          font-family: var(--serif);
          font-weight: 700;
          font-variation-settings: "opsz" 72, "wght" 700;
          font-size: 8.5px;
          letter-spacing: 0.18em;
          color: var(--accent-dark);
          text-shadow: 0 0 4px rgba(248, 238, 218, 0.9);
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          padding: 0 12px;
        }
      `}</style>
    </a>
  );
}
