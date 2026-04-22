"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for the /admin/manual form. Shows a pending state while
 * the curate AI call is in flight (usually 2-6 seconds) — otherwise the
 * reviewer clicks, nothing visibly happens, and they wonder whether the
 * submit registered.
 */
export default function SendButton() {
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
          Sending…
        </>
      ) : (
        "send to queue"
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
          animation: sb-spin 0.7s linear infinite;
          vertical-align: -1px;
        }
        @keyframes sb-spin { to { transform: rotate(360deg); } }
      `}</style>
    </button>
  );
}
