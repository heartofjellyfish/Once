"use client";

import { useEffect, useState } from "react";

interface Props {
  /** ms after mount when the first stage starts (backdrop should be on by then). */
  startMs: number;
  /** ms after mount when the last stage finishes (backdrop fades out after this). */
  endMs: number;
}

/**
 * Page-level dim + blur that covers everything except whatever is being
 * staged in. z-index sits just below .staged.playing, so the focused
 * element reads as the only solid thing on screen while the rest is
 * pushed back.
 *
 * Skipped under prefers-reduced-motion.
 */
export default function StageBackdrop({ startMs, endMs }: Props) {
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) {
      setReduced(true);
      return;
    }
    setActive(true);
    const t = setTimeout(() => setActive(false), endMs + 800);
    return () => clearTimeout(t);
  }, [endMs]);

  if (reduced) return null;

  return (
    <div
      className={`stage-backdrop ${active ? "on" : "off"}`}
      aria-hidden="true"
      style={
        {
          "--bd-in-start": `${Math.max(0, startMs - 200)}ms`,
          "--bd-out-start": `${endMs}ms`
        } as React.CSSProperties
      }
    >
      <style>{`
        .stage-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(20, 14, 6, 0.18);
          backdrop-filter: blur(3px) saturate(0.92);
          -webkit-backdrop-filter: blur(3px) saturate(0.92);
          z-index: 80;
          pointer-events: none;
          opacity: 0;
        }
        .stage-backdrop.on {
          animation:
            bd-in 700ms var(--bd-in-start, 0ms) forwards,
            bd-out 900ms var(--bd-out-start, 0ms) forwards;
        }
        @keyframes bd-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes bd-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
