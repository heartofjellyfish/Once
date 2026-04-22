"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for the reroll/resolve-photo form on pending cards.
 * Same pending-state treatment as Run Now and Send to Queue: spinner
 * while the photo chain is in flight (OG scrape + vision + Unsplash
 * queries take 2-8 seconds end to end).
 */
export default function RerollButton({
  hasPhoto
}: {
  hasPhoto: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="secondary-sm reroll-btn"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          resolving…
        </>
      ) : hasPhoto ? (
        "reroll photo"
      ) : (
        "resolve photo"
      )}
      <style>{`
        .reroll-btn {
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .reroll-btn:hover:not(:disabled) {
          background: var(--ink);
          color: var(--bg);
          border-color: var(--ink);
        }
        .reroll-btn[aria-busy="true"] {
          opacity: 0.7;
          cursor: progress;
        }
        .spinner {
          display: inline-block;
          width: 9px;
          height: 9px;
          border: 1.5px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: rr-spin 0.7s linear infinite;
        }
        @keyframes rr-spin { to { transform: rotate(360deg); } }
      `}</style>
    </button>
  );
}
