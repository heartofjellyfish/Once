"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for the "Run now" form. Shows a pending state while the
 * ingest pipeline is running — otherwise the user stares at a silent page
 * wondering whether the click registered. `useFormStatus` hooks into the
 * enclosing <form action={...}>, no prop wiring needed.
 */
export default function RunNowButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="primary"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          Running…
        </>
      ) : (
        "Run now"
      )}
      <style>{`
        button[aria-busy="true"] {
          opacity: 0.7;
          cursor: progress;
        }
        .spinner {
          display: inline-block;
          width: 10px;
          height: 10px;
          margin-right: 8px;
          border: 1.5px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: rn-spin 0.7s linear infinite;
          vertical-align: -1px;
        }
        @keyframes rn-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
