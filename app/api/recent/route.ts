import { NextResponse } from "next/server";
import { getAllStories } from "@/lib/stories";

// Dev-only: full dataset. Disabled in production so Once stays a
// single-moment experience, not a feed.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json(await getAllStories());
}
