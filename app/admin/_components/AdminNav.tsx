"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "queue", exact: true },
  { href: "/admin/schedule", label: "schedule" },
  { href: "/admin/runs", label: "runs" },
  { href: "/admin/sources", label: "sources" },
  { href: "/admin/manual", label: "manual" },
];

export default function AdminNav() {
  const path = usePathname();

  return (
    <nav>
      {LINKS.map(({ href, label, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
      <a href="/" target="_blank" rel="noreferrer">
        site ↗
      </a>

      <style>{`
        nav {
          display: flex;
          gap: 18px;
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        nav a {
          color: var(--ink-faint);
          text-decoration: none;
          padding-bottom: 2px;
          border-bottom: 1.5px solid transparent;
          transition: color 120ms;
        }
        nav a:hover { color: var(--ink); }
        nav a.active {
          color: var(--ink);
          border-bottom-color: var(--ink);
        }
      `}</style>
    </nav>
  );
}
