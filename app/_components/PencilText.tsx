"use client";

import { useEffect, useState } from "react";

interface Props {
  text: string;
  lang?: string;
  /** ms between character reveals. 42 ≈ a calm hand. */
  speed?: number;
  /** Additional pauses after certain punctuation. */
  periodPauseMs?: number;
  commaPauseMs?: number;
  /** If set, the same key within the same session-hour skips the animation. */
  memoryKey?: string;
  className?: string;
}

/**
 * Option D-ish. Renders text as one <span> per grapheme; each character
 * first appears as a thin stroked outline (as if traced by a pen), then
 * the stroke fills in to solid ink.
 *
 * Multi-script safe: uses Intl.Segmenter so Japanese, Thai, Georgian,
 * Tamil etc. are animated correctly. Layout is stable from the first
 * paint because every character is inline-block at its natural width
 * even while invisible.
 *
 * Honors prefers-reduced-motion and a 1-hour sessionStorage memo.
 *
 * Firefox (no -webkit-text-stroke): degrades gracefully to a per-char
 * fade + slide.
 */
export default function PencilText({
  text,
  lang,
  speed = 42,
  periodPauseMs = 260,
  commaPauseMs = 140,
  memoryKey,
  className
}: Props) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) return;

    if (memoryKey) {
      try {
        const seen = Number(sessionStorage.getItem(`once.pencil.${memoryKey}`));
        if (seen && Date.now() - seen < 60 * 60 * 1000) return;
      } catch {
        // ignore
      }
    }
    setShouldAnimate(true);

    if (memoryKey) {
      // Set the memo once the animation is done so a mid-animation reload
      // still plays the animation to completion.
      const duration = 700 + text.length * speed + 400;
      const t = window.setTimeout(() => {
        try {
          sessionStorage.setItem(
            `once.pencil.${memoryKey}`,
            String(Date.now())
          );
        } catch {
          // ignore
        }
      }, duration);
      return () => window.clearTimeout(t);
    }
  }, [memoryKey, speed, text]);

  // Initial SSR + reduced-motion + memoized: plain paragraph. Fast,
  // accessible, search-engine-visible.
  if (!shouldAnimate) {
    return (
      <p className={className} lang={lang}>
        {text}
      </p>
    );
  }

  // Split into graphemes so non-Latin scripts (CJK, Thai, etc.) animate
  // character-by-character correctly. Fall back to Array.from if the
  // runtime doesn't support Intl.Segmenter.
  const graphemes =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? Array.from(
          new Intl.Segmenter(lang || undefined, {
            granularity: "grapheme"
          }).segment(text),
          (s) => s.segment
        )
      : Array.from(text);

  // Compute cumulative delay per character, adding a pause after punctuation
  // so the reveal *feels* like someone pausing to think.
  const delays: number[] = [];
  let t = 200; // lead-in before the first character
  for (let i = 0; i < graphemes.length; i++) {
    delays.push(t);
    const c = graphemes[i];
    t += speed;
    if (/[.!?。！？]/.test(c)) t += periodPauseMs;
    else if (/[,、;；:：]/.test(c)) t += commaPauseMs;
  }

  return (
    <p className={`${className ?? ""} pencil-text`} lang={lang}>
      {graphemes.map((c, i) => {
        if (c === " " || c === "\n" || c === "\t") return c;
        return (
          <span
            key={i}
            className="ch"
            style={{ animationDelay: `${delays[i]}ms` }}
          >
            {c}
          </span>
        );
      })}

      <style>{`
        .pencil-text .ch {
          display: inline-block;
          color: transparent;
          -webkit-text-stroke: 0.45px var(--ink);
          opacity: 0;
          animation: ch-write 720ms forwards ease-out;
          animation-fill-mode: both;
        }
        @keyframes ch-write {
          0% {
            opacity: 0;
            transform: translateY(1.5px);
            color: transparent;
            -webkit-text-stroke-width: 0.55px;
          }
          15% {
            opacity: 1;
            transform: translateY(0);
            color: transparent;
            -webkit-text-stroke-width: 0.55px;
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            color: var(--ink);
            -webkit-text-stroke-width: 0;
          }
        }
        /* Firefox: -webkit-text-stroke unsupported → simple fade + slide */
        @supports not (-webkit-text-stroke: 0.5px black) {
          .pencil-text .ch {
            color: var(--ink);
            -webkit-text-stroke: 0;
          }
          @keyframes ch-write {
            0%   { opacity: 0; transform: translateY(1.5px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        }
      `}</style>
    </p>
  );
}
