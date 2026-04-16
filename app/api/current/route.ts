import { NextResponse } from "next/server";
import { getCurrentStory } from "@/lib/stories";

export const revalidate = 3600;

export async function GET() {
  const story = getCurrentStory();
  return NextResponse.json(story);
}
