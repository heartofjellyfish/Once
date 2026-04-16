/**
 * HTTP Basic auth helpers. Used by middleware.ts and by API routes that
 * want their own check.
 */

/** Constant-time string compare to avoid timing side-channels. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Returns true if the Basic header matches ADMIN_USER/ADMIN_PASSWORD. */
export function checkBasicAuth(header: string | null): boolean {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return false;
  if (!header || !header.startsWith("Basic ")) return false;

  const encoded = header.slice("Basic ".length).trim();
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);
  return safeEqual(u, user) && safeEqual(p, pass);
}

export const UNAUTHORIZED_RESPONSE = new Response("Authentication required.", {
  status: 401,
  headers: { "WWW-Authenticate": 'Basic realm="Once admin", charset="UTF-8"' }
});
