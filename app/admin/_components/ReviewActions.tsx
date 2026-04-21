"use client";

import { useRef, useTransition } from "react";

/**
 * Client wrapper for the pending card's three actions. When the user
 * submits any of mark-good / reject / publish, we add an `.exiting`
 * class to the parent `<article>` so it fades out, then run the
 * server action. The page then revalidates without the row.
 *
 * The animation is purely decorative — the server action is still the
 * source of truth. If JS is disabled, the button still works via the
 * plain form submit (no animation).
 */
export function ReviewActionForm({
  action,
  children,
  className,
  cardSelector = "article"
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
  cardSelector?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const card = form.closest(cardSelector) as HTMLElement | null;
    const fd = new FormData(form);

    if (card) {
      card.classList.add("exiting");
    }

    // Wait for the CSS transition to finish before the server action
    // runs. The redirect happens inside the action, so by the time the
    // server action resolves the page has already been replaced.
    window.setTimeout(() => {
      startTransition(() => {
        action(fd);
      });
    }, 220);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}
