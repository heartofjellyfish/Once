"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface Props {
  /** Animation-delay in ms. When the stage-in starts for this element. */
  delay: number;
  /** Total ms from first frame to arriving at final position. */
  duration?: number;
  /** 0-1. How zoomed in during the "staring" phase. */
  scale?: number;
  /** 0-1. Fraction of duration spent staring at center (held still). */
  stare?: number;
  /** Fraction of duration spent fading in at the start. */
  fadeIn?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Wraps a block so it stages itself in at screen center, holds for a beat,
 * then flies to its real layout position. Measures position on mount so
 * the fly-out vector is correct regardless of responsive grid.
 *
 * Uses only transform/opacity/filter — doesn't disturb layout. Plays
 * above everything else during the animation (z-index 3), then drops
 * back to default.
 *
 * Respects prefers-reduced-motion: renders plain, no animation.
 */
export default function StagedCenter({
  delay,
  duration = 2500,
  scale = 1.18,
  // Fraction of duration spent holding at center (the 凝视 beat).
  stare = 0.30,
  // Fraction spent fading in at the start.
  fadeIn = 0.15,
  children,
  className,
  style
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [reduced, setReduced] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) {
      setReduced(true);
      setMeasured(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const ecx = rect.left + rect.width / 2;
    const ecy = rect.top + rect.height / 2;
    setOffset({ x: cx - ecx, y: cy - ecy });
    setMeasured(true);
  }, []);

  // Keyframe percentages (stable across elements; actual durations
  // are driven by --stage-duration via animation-delay on the element).
  // 0%     → at center (translated), scaled up, blurred, fully transparent
  // fadeIn → fully visible at center, deblurred
  // stare  → still held at center
  // 100%   → at final position, scale 1, transform 0
  const fadeInPct = Math.round(fadeIn * 100);
  const stareEndPct = Math.round((fadeIn + stare) * 100);

  const styleVars: React.CSSProperties = measured
    ? reduced
      ? {}
      : ({
          "--fly-x": `${offset.x.toFixed(1)}px`,
          "--fly-y": `${offset.y.toFixed(1)}px`,
          "--stage-duration": `${duration}ms`,
          "--stage-delay": `${delay}ms`,
          "--stage-scale": String(scale),
          animationName: `staged-fly-${fadeInPct}-${stareEndPct}`
        } as React.CSSProperties)
    : { opacity: 0 }; // hide before measurement so no flash at final spot

  return (
    <div
      ref={ref}
      className={`staged ${measured && !reduced ? "playing" : ""} ${className ?? ""}`}
      style={{ ...style, ...styleVars }}
    >
      {children}

      {/* Each instance emits its own keyframe with the chosen fadeIn/stare
          splits baked into the % stops (CSS keyframes can't read vars). */}
      <style>{`
        .staged {
          display: block;
          transform-origin: center center;
        }
        .staged.playing {
          opacity: 0;
          animation-duration: var(--stage-duration, 2500ms);
          animation-delay: var(--stage-delay, 0ms);
          /* Gentle S-curve: quick settle-in at center, then a leisurely
             deceleration as it lands in place. */
          animation-timing-function: cubic-bezier(0.4, 0.08, 0.2, 1);
          animation-fill-mode: forwards;
          will-change: transform, opacity, filter;
          z-index: 120;
          position: relative;
        }
        @keyframes staged-fly-${fadeInPct}-${stareEndPct} {
          0% {
            opacity: 0;
            transform: translate(var(--fly-x, 0), var(--fly-y, 0))
                       scale(var(--stage-scale, 1.18));
            filter: blur(6px);
          }
          ${fadeInPct}% {
            opacity: 1;
            transform: translate(var(--fly-x, 0), var(--fly-y, 0))
                       scale(var(--stage-scale, 1.18));
            filter: blur(0);
          }
          ${stareEndPct}% {
            opacity: 1;
            transform: translate(var(--fly-x, 0), var(--fly-y, 0))
                       scale(var(--stage-scale, 1.18));
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>
    </div>
  );
}
