"use client";

import { useFormStatus } from "react-dom";

/**
 * Pending-state wrapper for the photo thumbnail + metadata. Uses
 * useFormStatus so the whole row (not just the reroll button) shows
 * a loading state while the photo chain runs. Otherwise the reviewer
 * clicks the small reroll button, nothing visibly happens for 5
 * seconds, and they assume the button is broken.
 */
export default function PhotoRow({
  children
}: {
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <div className={`photo-row ${pending ? "photo-row-pending" : ""}`}>
      {children}
      {pending ? (
        <div className="photo-overlay" aria-hidden="true">
          <span className="photo-spinner" />
        </div>
      ) : null}
      <style>{`
        .photo-row { position: relative; }
        .photo-row-pending .photo-thumb,
        .photo-row-pending .photo-meta {
          opacity: 0.4;
          transition: opacity 120ms ease;
        }
        .photo-overlay {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .photo-spinner {
          display: inline-block;
          width: 22px;
          height: 22px;
          border: 2px solid var(--ink, #2a1708);
          border-top-color: transparent;
          border-radius: 50%;
          animation: pr-spin 0.7s linear infinite;
        }
        @keyframes pr-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
