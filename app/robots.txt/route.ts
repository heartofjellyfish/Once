export const dynamic = "force-static";

export function GET() {
  const body = [
    "User-agent: *",
    "Disallow: /admin/",
    "Disallow: /api/recent",
    "Allow: /",
    ""
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
