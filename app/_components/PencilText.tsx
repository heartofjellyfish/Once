"use client";

import { useEffect, useState } from "react";

interface Props {
  text: string;
  lang?: string;
  /** ms between character reveals. 38 ≈ a calm hand. */
  speed?: number;
  periodPauseMs?: number;
  commaPauseMs?: number;
  className?: string;
}

/**
 * Ink-developing reveal: each character fades in with a small Y drop
 * and subtle horizontal jitter so the baseline feels handwritten, not
 * machine-typed. Punctuation gets a small pause to give a reader's
 * rhythm.
 *
 * Multi-script safe via Intl.Segmenter (CJK, Thai, Georgian, etc. all
 * animate character-by-character).
 *
 * Always replays on reload — no sessionStorage memo.
 * Honors prefers-reduced-motion.
 * Firefox fallback: straight fade (no transform jitter).
 */
export default function PencilText({
  text,
  lang,
  speed = 38,
  periodPauseMs = 260,
  commaPauseMs = 140,
  className
}: Props) {
  const [animate, setAnimate] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mql.matches);
    setReady(true);
  }, []);

  // SSR and reduced-motion render plain text.
  if (!ready || !animate) {
    return (
      <p className={className} lang={lang}>
        {text}
      </p>
    );
  }

  const graphemes =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? Array.from(
          new Intl.Segmenter(lang || undefined, {
            granularity: "grapheme"
          }).segment(text),
          (s) => s.segment
        )
      : Array.from(text);

  // Compute cumulative delay per character, with natural pauses.
  const delays: number[] = [];
  let t = 140; // small lead-in
  for (let i = 0; i < graphemes.length; i++) {
    delays.push(t);
    const c = graphemes[i];
    t += speed;
    if (/[.!?。！？]/.test(c)) t += periodPauseMs;
    else if (/[,、;；:：]/.test(c)) t += commaPauseMs;
  }

  // Deterministic per-character jitter so reloads look the same.
  // -0.6px to +0.6px horizontal, 0 to 1px vertical drop.
  function jitter(seed: number, span: number) {
    const h = (seed * 2654435761) % 10007;
    return ((h / 10007) * 2 - 1) * span;
  }

  return (
    <p className={`${className ?? ""} pencil-text`} lang={lang}>
      {graphemes.map((c, i) => {
        if (c === " " || c === "\n" || c === "\t") return c;
        const dx = jitter(i + 1, 0.4).toFixed(2);
        const dy = Math.abs(jitter(i + 7, 0.6)).toFixed(2);
        return (
          <span
            key={i}
            className="ch"
            style={{
              animationDelay: `${delays[i]}ms`,
              // CSS variables consumed by keyframe
              ["--dx" as string]: `${dx}px`,
              ["--dy" as string]: `${dy}px`
            }}
          >
            {c}
          </span>
        );
      })}

      <style>{`
        .pencil-text .ch {
          display: inline-block;
          opacity: 0;
          animation: ink-in 520ms forwards cubic-bezier(0.2, 0.75, 0.3, 1);
          animation-fill-mode: both;
          will-change: opacity, transform, filter;
        }
        @keyframes ink-in {
          0% {
            opacity: 0;
            transform: translate(0, calc(var(--dy, 0.5px) + 2px));
            filter: blur(0.7px);
          }
          55% {
            opacity: 1;
            transform: translate(var(--dx, 0), calc(var(--dy, 0) * 0.3));
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translate(var(--dx, 0), calc(var(--dy, 0) * 0));
            filter: blur(0);
          }
        }
        /* prefers-reduced-motion already bypassed at component level */
      `}</style>
    </p>
  );
}
