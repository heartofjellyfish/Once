"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** Animation-delay in ms. When the stage-in starts for this element. */
  delay: number;
  /** Total ms from first frame to arriving at final position. */
  duration?: number;
  /** How zoomed in during the "staring" phase. */
  scale?: number;
  /** 0-1. Fraction of duration spent staring at center (held still). */
  stare?: number;
  /** 0-1. Fraction of duration spent fading in at the start. */
  fadeIn?: number;
  /** 0-1. Fraction of duration at which the backdrop blur should be
   *  fully on. Defaults to fadeIn — blur completes exactly as the
   *  element finishes materializing. For the title (which keeps
   *  "appearing" via typing across the whole stare phase), pass a
   *  value equal to fadeIn + stare so the blur peaks when the last
   *  character lands. */
  blurCompleteAt?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Wraps a block so it stages itself in at screen center, holds for a beat,
 * then flies to its real layout position. Measures position on mount so
 * the fly-out vector is correct regardless of responsive grid.
 *
 * Only holds z-index while actively animating. After the animation ends,
 * it drops back to normal flow so a later stage entering at z-index 120
 * paints cleanly on top of it (prevents "note appears behind polaroid"
 * after polaroid has already settled).
 *
 * Respects prefers-reduced-motion: renders plain, no animation.
 */
export default function StagedCenter({
  delay,
  duration = 3800,
  scale = 1.18,
  // Slower element materialization gives the blur ramp more breathing
  // room. fadeIn is the fraction during which the element is flying
  // to center + de-blurring; a longer fadeIn means the backdrop's
  // parallel blur-in feels gradual instead of rushed.
  stare = 0.26,
  fadeIn = 0.32,
  blurCompleteAt,
  children,
  className,
  style
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(false);
  const [settled, setSettled] = useState(false);
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

  // Keyframe percentages baked into the emitted keyframe (CSS keyframe
  // stops don't read custom properties).
  const fadeInPct = Math.round(fadeIn * 100);
  const stareEndPct = Math.round((fadeIn + stare) * 100);
  const keyName = `staged-fly-${fadeInPct}-${stareEndPct}`;

  // Backdrop timing: starts ramping the moment the element enters (0%),
  // completes exactly as the element is fully in foreground. Holds for
  // a beat, then fades out.
  const blurPeakPct = Math.round(
    (blurCompleteAt != null ? blurCompleteAt : fadeIn) * 100
  );
  const bdHoldEndPct = Math.min(92, blurPeakPct + Math.max(6, Math.round((100 - blurPeakPct) * 0.35)));
  const bdKeyName = `stage-bd-${blurPeakPct}-${bdHoldEndPct}`;

  const shouldAnimate = measured && !reduced && !settled;

  const styleVars: React.CSSProperties = shouldAnimate
    ? ({
        "--fly-x": `${offset.x.toFixed(1)}px`,
        "--fly-y": `${offset.y.toFixed(1)}px`,
        "--stage-duration": `${duration}ms`,
        "--stage-delay": `${delay}ms`,
        "--stage-scale": String(scale),
        animationName: keyName
      } as React.CSSProperties)
    : measured
    ? {} // reduced-motion or settled → plain
    : { opacity: 0 }; // pre-measurement → hide

  const classes = [
    "staged",
    shouldAnimate ? "playing" : "",
    settled ? "settled" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  // Per-stage backdrop: starts ramping from the moment the element
  // enters, peaks exactly when the element is fully in the foreground,
  // holds for a beat, then fades out during the fly-home tail.
  //
  // Portaled to <body> so it escapes every parent stacking context and
  // blurs the entire viewport. Shared .stage-backdrop styles (position,
  // dim, blur) live in globals.css — bound inline here are only the
  // per-instance animation-name, duration, and delay, so the CSS
  // cascade can never let one stage's keyframe name overwrite another.
  const backdrop =
    shouldAnimate && typeof document !== "undefined"
      ? createPortal(
          <div
            className="stage-backdrop"
            aria-hidden="true"
            style={{
              animationName: bdKeyName,
              animationDuration: `${duration}ms`,
              animationDelay: `${delay}ms`
            }}
          >
            <style>{`
              @keyframes ${bdKeyName} {
                0% { opacity: 0; }
                ${blurPeakPct}% { opacity: 1; }
                ${bdHoldEndPct}% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}</style>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={ref}
      className={classes}
      style={{ ...style, ...styleVars }}
      onAnimationEnd={(e) => {
        // Only react to the stage-fly animation, not inner children's.
        if ((e as React.AnimationEvent<HTMLDivElement>).animationName === keyName) {
          setSettled(true);
        }
      }}
    >
      {children}
      {backdrop}

      <style>{`
        .staged {
          display: block;
          transform-origin: center center;
        }
        .staged.playing {
          opacity: 0;
          animation-duration: var(--stage-duration, 3200ms);
          animation-delay: var(--stage-delay, 0ms);
          /* Gentler S-curve for a calmer landing. Slow start, smooth
             through, long tail so the "putting down" decelerates over
             the last third instead of snapping into place. */
          animation-timing-function: cubic-bezier(0.42, 0, 0.22, 1);
          animation-fill-mode: forwards;
          will-change: transform, opacity, filter;
          /* High z + positioning + isolation ensures a stacking context
             at the top of its ancestors' context, so this block paints
             above everything already-settled on the page. */
          z-index: 120;
          position: relative;
          isolation: isolate;
          /* While staging (which includes the paused-until-envelope-
             dismissed phase where opacity is still 0), the wrapper is
             transparent but would otherwise still intercept clicks and
             swallow the envelope's onClick. Let pointer events pass
             through until the element is settled and interactive. */
          pointer-events: none;
        }
        .staged.settled {
          /* Animation fully over: drop the high z-index so the next stage
             paints above us. Visually identical to the animation's final
             frame (translate(0,0) scale(1), filter/opacity normal). */
          animation: none;
          opacity: 1;
          transform: none;
          filter: none;
          z-index: auto;
          position: static;
          isolation: auto;
        }
        @keyframes ${keyName} {
          0% {
            opacity: 0;
            transform: translate(var(--fly-x, 0), var(--fly-y, 0))
                       scale(var(--stage-scale, 1.18));
            /* Softer starting blur so the deblur ramp is less contrasty. */
            filter: blur(3.5px);
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
