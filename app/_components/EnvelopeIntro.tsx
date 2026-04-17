"use client";

import { useEffect, useState } from "react";
import MapPostmark from "./MapPostmark";

interface Props {
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

const SLOGAN = "A slice of ordinary life, from elsewhere — hourly.";
const STORAGE_KEY = "once.seen";

/**
 * First-visit envelope. On return visits it stays out of the way.
 *
 * Flow:
 *   1. Mount → check localStorage; if user has been here before, do
 *      nothing. Content below is already SSR'd.
 *   2. Otherwise fade in a dimmed backdrop with a tilted envelope
 *      containing the current story's stamp, return address, wordmark,
 *      and slogan.
 *   3. Click / tap / Enter / Space / Escape → envelope lifts and fades,
 *      backdrop fades, content shows through. localStorage gets marked.
 *   4. prefers-reduced-motion skips animations.
 */
export default function EnvelopeIntro({ city, country, lat, lng }: Props) {
  const [phase, setPhase] = useState<"hidden" | "visible" | "closing">(
    "hidden"
  );

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // localStorage unavailable — still show the envelope once.
    }
    // Let the page paint first so the envelope appears *onto* content.
    const t = window.setTimeout(() => setPhase("visible"), 140);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "visible") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function dismiss() {
    if (phase === "closing" || phase === "hidden") return;
    setPhase("closing");
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    window.setTimeout(() => setPhase("hidden"), 650);
  }

  if (phase === "hidden") return null;

  return (
    <div
      className={`env-overlay ${phase === "closing" ? "closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="env-title"
      aria-describedby="env-slogan"
      onClick={dismiss}
    >
      <button
        type="button"
        className="envelope"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        aria-label="Open Once"
      >
        <svg
          className="flap-seam"
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M 0 0 L 50 56 L 100 0"
            fill="none"
            stroke="rgba(80, 45, 15, 0.14)"
            strokeWidth="0.4"
          />
        </svg>

        <div className="return-address">
          From {city}, {country}
        </div>

        {lat != null && lng != null ? (
          <div className="stamp-area">
            <MapPostmark
              lat={lat}
              lng={lng}
              city={city}
              country={country}
              width={88}
            />
            <svg
              className="cancellation"
              viewBox="0 0 160 60"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M -5 14 Q 20 6, 40 14 T 80 14 T 120 14 T 170 14" />
              <path d="M -5 28 Q 20 20, 40 28 T 80 28 T 120 28 T 170 28" />
              <path d="M -5 42 Q 20 34, 40 42 T 80 42 T 120 42 T 170 42" />
            </svg>
          </div>
        ) : null}

        <div className="middle">
          <div className="wordmark" id="env-title">
            <em>Once</em>
          </div>
          <p className="slogan" id="env-slogan">
            {SLOGAN}
          </p>
        </div>

        <div className="hint" aria-hidden="true">
          click to open
        </div>
      </button>

      <style>{`
        .env-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(32, 23, 8, 0.38);
          backdrop-filter: blur(3px) saturate(0.9);
          -webkit-backdrop-filter: blur(3px) saturate(0.9);
          animation: env-overlay-in 500ms ease-out both;
        }
        .env-overlay.closing {
          animation: env-overlay-out 450ms ease-in forwards;
        }
        @keyframes env-overlay-in {
          from { opacity: 0; backdrop-filter: blur(0) saturate(1); }
          to   { opacity: 1; }
        }
        @keyframes env-overlay-out {
          to   { opacity: 0; }
        }

        .envelope {
          position: relative;
          width: min(560px, 92vw);
          aspect-ratio: 1.55 / 1;
          padding: 0;
          font-family: var(--serif);
          color: var(--ink);
          text-align: center;
          cursor: pointer;
          border: 1px solid rgba(80, 45, 15, 0.14);
          border-radius: 2px;
          background-color: #f6eed9;
          background-image:
            url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.17  0 0 0 0 0.08  0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E"),
            linear-gradient(172deg, #faf2dd 0%, #ebdcba 100%);
          background-blend-mode: multiply, normal;
          box-shadow:
            0 1px 0 rgba(32, 23, 8, 0.06),
            0 44px 88px -36px rgba(42, 23, 8, 0.5),
            0 22px 44px -22px rgba(42, 23, 8, 0.25),
            inset 0 0 0 1px rgba(42, 23, 8, 0.04);
          transform: rotate(-2deg);
          transform-origin: center;
          animation: env-arrive 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        .env-overlay.closing .envelope {
          animation: env-leave 600ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes env-arrive {
          0%   { opacity: 0; transform: rotate(-5deg) translateY(30px) scale(0.96); }
          60%  { opacity: 1; }
          100% { opacity: 1; transform: rotate(-2deg) translateY(0) scale(1); }
        }
        @keyframes env-leave {
          0%   { opacity: 1; transform: rotate(-2deg) translateY(0) scale(1); }
          100% { opacity: 0; transform: rotate(-3deg) translateY(-36px) scale(1.04); }
        }
        .envelope:hover {
          transform: rotate(-1.4deg) translateY(-2px);
        }
        .envelope:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 4px;
        }

        .flap-seam {
          position: absolute;
          inset: 0 0 auto 0;
          width: 100%;
          height: 56%;
          pointer-events: none;
        }

        .return-address {
          position: absolute;
          top: 18px;
          left: 28px;
          font-family: var(--cursive);
          font-size: clamp(14px, 1.6vw, 16px);
          color: var(--accent-dark);
          opacity: 0.85;
          max-width: 55%;
          text-align: left;
          line-height: 1.2;
        }

        .stamp-area {
          position: absolute;
          top: 16px;
          right: 22px;
        }
        .cancellation {
          position: absolute;
          top: 18px;
          left: -18px;
          width: 150px;
          height: 54px;
          opacity: 0.38;
          transform: rotate(-14deg);
          pointer-events: none;
        }
        .cancellation path {
          stroke: var(--accent-dark);
          stroke-width: 1.3;
          stroke-linecap: round;
          fill: none;
        }

        .middle {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0 48px;
          gap: 18px;
        }

        .wordmark {
          font-family: var(--serif);
          font-style: italic;
          font-variation-settings: "opsz" 144, "SOFT" 100, "wght" 400;
          font-size: clamp(28px, 3.4vw, 36px);
          color: var(--ink);
          line-height: 1;
          position: relative;
          display: inline-block;
          padding: 0 22px;
        }
        .wordmark em { font-style: italic; font-weight: 400; }
        .wordmark::before,
        .wordmark::after {
          content: "";
          position: absolute;
          top: 52%;
          width: 30px;
          height: 1px;
          background: var(--ink-faint);
          opacity: 0.5;
        }
        .wordmark::before { right: 100%; }
        .wordmark::after  { left: 100%; }

        .slogan {
          margin: 0;
          font-family: var(--serif);
          font-style: italic;
          font-variation-settings: "opsz" 18, "SOFT" 80, "wght" 400;
          font-size: clamp(15px, 1.6vw, 18px);
          line-height: 1.55;
          color: var(--ink-soft);
          letter-spacing: 0.003em;
          text-wrap: balance;
          max-width: 28em;
        }

        .hint {
          position: absolute;
          bottom: 18px;
          left: 0;
          right: 0;
          font-family: var(--cursive);
          font-size: clamp(13px, 1.4vw, 15px);
          color: var(--ink-faint);
          opacity: 0.5;
          letter-spacing: 0.02em;
          animation: hint-breathe 2.6s ease-in-out infinite;
        }
        @keyframes hint-breathe {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 0.75; }
        }

        @media (prefers-reduced-motion: reduce) {
          .env-overlay,
          .env-overlay.closing,
          .envelope,
          .env-overlay.closing .envelope,
          .hint {
            animation: none !important;
          }
          .envelope { transform: rotate(-2deg); }
          .env-overlay.closing { opacity: 0; transition: opacity 250ms linear; }
          .env-overlay.closing .envelope { opacity: 0; transition: opacity 250ms linear; }
        }

        @media (max-width: 560px) {
          .envelope {
            aspect-ratio: 1.25 / 1;
            padding: 0;
          }
          .return-address {
            top: 14px;
            left: 16px;
            font-size: 13px;
            max-width: 50%;
          }
          .stamp-area { top: 12px; right: 12px; }
          .middle { padding: 0 24px; gap: 12px; }
          .wordmark { font-size: 28px; }
          .slogan { font-size: 14.5px; }
          .hint { bottom: 12px; font-size: 12.5px; }
        }
      `}</style>
    </div>
  );
}
