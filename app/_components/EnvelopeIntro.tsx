"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import MapPostmark from "./MapPostmark";
import { SLOGAN_BY_LANG, RTL_LANGS } from "@/lib/slogan";

// Cloth envelope is code-split — ~180KB (three + r3f) only loads when we
// actually want it. Stays out of the main page bundle.
const ClothEnvelope = dynamic(() => import("./ClothEnvelope"), {
  ssr: false
});

interface Props {
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  /** ISO 639-1 code of the story's local language, for the bilingual slogan */
  language?: string;
}

/** Quick WebGL probe so we can fall back gracefully. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

export default function EnvelopeIntro({
  city,
  country,
  lat,
  lng,
  language
}: Props) {
  const [phase, setPhase] = useState<"hidden" | "visible" | "closing">(
    "hidden"
  );
  // Opt into Three.js cloth if the browser can handle it and the user
  // hasn't asked for reduced motion.
  const [useCloth, setUseCloth] = useState(false);
  // Becomes true once the cloth's canvas texture + plane are rendered —
  // we then fade the HTML fallback out.
  const [clothReady, setClothReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("visible"), 140);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (!reducedMotion && hasWebGL()) {
      setUseCloth(true);
    }
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
    if (phase !== "visible") return;
    setPhase("closing");
    window.setTimeout(() => setPhase("hidden"), 650);
  }

  if (phase === "hidden") return null;

  const localSlogan = language ? SLOGAN_BY_LANG[language] : undefined;
  const localIsRtl = language ? RTL_LANGS.has(language) : false;

  return (
    <div
      className={`env-overlay ${phase === "closing" ? "closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Once — a slice of ordinary life, from elsewhere — hourly"
      onClick={dismiss}
    >
      {/* HTML envelope — fallback + first-paint while Three.js loads.
          Unmounts once cloth texture is ready. */}
      {!clothReady ? (
        <div className="env-arrival">
          <button
            type="button"
            className="envelope"
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            aria-label="Open Once"
          >
            <div className="flap" aria-hidden="true">
              <svg viewBox="0 0 100 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="flapShade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(80, 45, 15, 0.18)" />
                    <stop offset="100%" stopColor="rgba(80, 45, 15, 0)" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0 0 L 50 58 L 100 0 L 100 60 L 0 60 Z"
                  fill="url(#flapShade)"
                />
                <path
                  d="M 0 0 L 50 58 L 100 0"
                  fill="none"
                  stroke="rgba(80, 45, 15, 0.28)"
                  strokeWidth="0.5"
                />
              </svg>
            </div>

            <div className="corner-fold" aria-hidden="true" />

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
                  width={84}
                />
                <svg
                  className="cancellation"
                  viewBox="0 0 140 48"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M 4 10 Q 22 4, 40 10 T 76 10 T 112 10 T 140 10" />
                  <path d="M 4 24 Q 22 18, 40 24 T 76 24 T 112 24 T 140 24" />
                  <path d="M 4 38 Q 22 32, 40 38 T 76 38 T 112 38 T 140 38" />
                </svg>
              </div>
            ) : null}

            <div className="middle">
              <p className="slogan en">
                A slice of{" "}
                <span className="crossed">
                  mundane
                  <span className="cross-line" aria-hidden="true" />
                </span>
                {" "}ordinary life,
                <br />
                from elsewhere &mdash; hourly.
              </p>

              {localSlogan ? (
                <p
                  className="slogan local"
                  lang={language}
                  dir={localIsRtl ? "rtl" : undefined}
                >
                  {localSlogan}
                </p>
              ) : null}
            </div>

            <div className="hint" aria-hidden="true">
              <span>click to open</span>
            </div>
          </button>
        </div>
      ) : null}

      {/* Cloth envelope — Three.js, loaded lazily. Hides HTML fallback
          once its own texture is built and the plane first renders. */}
      {useCloth ? (
        <ClothEnvelope
          city={city}
          country={country}
          lat={lat}
          lng={lng}
          language={language}
          state={phase === "closing" ? "closing" : "visible"}
          onDismiss={dismiss}
          onReady={() => setClothReady(true)}
        />
      ) : null}

      <style>{`
        /* ── backdrop: heavy blur over the real content ─────────────── */
        .env-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(40, 28, 12, 0.36);
          backdrop-filter: blur(26px) saturate(0.85) brightness(0.92);
          -webkit-backdrop-filter: blur(26px) saturate(0.85) brightness(0.92);
          animation: env-overlay-in 600ms ease-out both;
        }
        .env-overlay.closing {
          animation: env-overlay-out 500ms ease-in forwards;
        }
        @keyframes env-overlay-in {
          from { opacity: 0; backdrop-filter: blur(0) saturate(1); }
          to   { opacity: 1; }
        }
        @keyframes env-overlay-out {
          to { opacity: 0; }
        }

        /* ── arrival / exit wrapper (handles enter + leave) ─────────── */
        .env-arrival {
          transform: rotate(-2deg);
          animation: env-arrive 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        .env-overlay.closing .env-arrival {
          animation: env-leave 600ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes env-arrive {
          0%   { opacity: 0; transform: rotate(-5deg) translateY(34px) scale(0.96); }
          60%  { opacity: 1; }
          100% { opacity: 1; transform: rotate(-2deg) translateY(0) scale(1); }
        }
        @keyframes env-leave {
          0%   { opacity: 1; transform: rotate(-2deg) translateY(0) scale(1); }
          100% { opacity: 0; transform: rotate(-3deg) translateY(-40px) scale(1.04); }
        }

        /* ── HTML envelope (fallback) ──────────────────────────────── */
        .envelope {
          position: relative;
          display: block;
          width: min(580px, 92vw);
          aspect-ratio: 1.55 / 1;
          padding: 0;
          font-family: var(--serif);
          color: var(--ink-soft);
          text-align: center;
          cursor: pointer;
          border: 1px solid rgba(80, 45, 15, 0.14);
          border-radius: 2px;
          overflow: hidden;
          background-color: #fbf3d8;
          background-image:
            radial-gradient(ellipse 85% 65% at 22% 16%, rgba(255, 248, 214, 0.55) 0%, transparent 58%),
            url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.4' numOctaves='1' seed='5' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 0.28 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E"),
            url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.008 0.28' numOctaves='2' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.32  0 0 0 0 0.22  0 0 0 0 0.11  0 0 0 0.22 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E"),
            url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Cfilter id='b'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0035' numOctaves='2' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.36  0 0 0 0 0.25  0 0 0 0 0.11  0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23b)'/%3E%3C/svg%3E"),
            linear-gradient(172deg, #fdf6db 0%, #f0e2b4 100%);
          background-repeat: no-repeat, repeat, repeat, repeat, no-repeat;
          background-size: auto, 240px 240px, 600px 600px, 800px 800px, auto;
          background-blend-mode: normal, multiply, multiply, multiply, normal;
          box-shadow:
            0 1px 0 rgba(32, 23, 8, 0.06),
            0 44px 92px -36px rgba(42, 23, 8, 0.5),
            0 22px 46px -22px rgba(42, 23, 8, 0.28),
            inset 0 0 0 1px rgba(42, 23, 8, 0.04);
        }
        .envelope:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 4px;
        }

        .flap {
          position: absolute;
          inset: 0 0 auto 0;
          width: 100%;
          height: 62%;
          pointer-events: none;
        }
        .flap svg { width: 100%; height: 100%; display: block; }

        .corner-fold {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 36px;
          height: 36px;
          background:
            linear-gradient(135deg, transparent 50%, rgba(80, 45, 15, 0.14) 50%, rgba(80, 45, 15, 0.22) 56%, rgba(234, 214, 170, 1) 56%, #e4d39f 100%);
          clip-path: polygon(100% 0, 100% 100%, 0 100%);
          pointer-events: none;
          opacity: 0.6;
        }

        .return-address {
          position: absolute;
          top: 16px;
          left: 24px;
          font-family: var(--cursive);
          font-size: clamp(13px, 1.5vw, 16px);
          color: var(--accent-dark);
          opacity: 0.82;
          max-width: 50%;
          text-align: left;
          line-height: 1.2;
          z-index: 2;
        }

        .stamp-area {
          position: absolute;
          top: 14px;
          right: 18px;
          z-index: 2;
        }
        .cancellation {
          position: absolute;
          top: 10px;
          left: -28px;
          width: 130px;
          height: 46px;
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
          padding: 0 clamp(36px, 6vw, 64px);
          gap: clamp(10px, 1.4vh, 18px);
          z-index: 1;
        }
        .slogan {
          margin: 0;
          color: var(--ink-soft);
          line-height: 1.45;
          text-wrap: pretty;
        }
        .slogan.en {
          font-family: var(--cursive);
          font-size: clamp(20px, 2.4vw, 26px);
          letter-spacing: 0.005em;
          max-width: 22em;
        }
        .slogan.local {
          font-family: var(--cursive);
          font-size: clamp(15px, 1.7vw, 18px);
          color: var(--ink-muted);
          opacity: 0.92;
          max-width: 22em;
        }
        .crossed {
          position: relative;
          display: inline-block;
          color: var(--ink-faint);
        }
        .cross-line {
          position: absolute;
          top: 52%;
          left: -3%;
          width: 106%;
          height: 1.4px;
          background: var(--ink-muted);
          transform: rotate(-3.5deg);
          transform-origin: center;
          border-radius: 1px;
          opacity: 0.85;
        }
        .hint {
          position: absolute;
          bottom: 16px;
          left: 0;
          right: 0;
          font-family: var(--cursive);
          font-size: clamp(12px, 1.3vw, 14px);
          color: var(--ink-faint);
          opacity: 0.45;
          letter-spacing: 0.02em;
          animation: hint-breathe 2.6s ease-in-out infinite;
          z-index: 2;
        }
        @keyframes hint-breathe {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 0.7; }
        }

        @media (prefers-reduced-motion: reduce) {
          .env-overlay,
          .env-overlay.closing,
          .env-arrival,
          .env-overlay.closing .env-arrival,
          .hint {
            animation: none !important;
          }
          .env-arrival { transform: rotate(-2deg); }
          .env-overlay.closing { opacity: 0; transition: opacity 250ms linear; }
          .env-overlay.closing .env-arrival { opacity: 0; transition: opacity 250ms linear; }
        }

        @media (max-width: 560px) {
          .envelope { aspect-ratio: 1.25 / 1; }
          .return-address { top: 12px; left: 14px; font-size: 13px; max-width: 48%; }
          .stamp-area { top: 10px; right: 10px; }
          .cancellation { left: -18px; width: 100px; height: 40px; top: 8px; }
          .middle { padding: 0 22px; gap: 10px; }
          .slogan.en { font-size: 17px; }
          .slogan.local { font-size: 14px; }
          .hint { bottom: 10px; font-size: 12px; }
          .corner-fold { width: 26px; height: 26px; }
        }
      `}</style>
    </div>
  );
}
