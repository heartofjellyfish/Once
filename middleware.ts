import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth } from "@/lib/auth";

/**
 * Gate everything under /admin behind HTTP Basic auth.
 * ADMIN_USER and ADMIN_PASSWORD must be set in env. If either is missing,
 * the admin area is locked shut — better than accidentally exposing it.
 */
export function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (checkBasicAuth(auth)) {
    return NextResponse.next();
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Once admin", charset="UTF-8"'
    }
  });
}

export const config = {
  matcher: ["/admin/:path*"]
};
