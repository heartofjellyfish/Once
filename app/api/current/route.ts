import { NextResponse } from "next/server";
import { getCurrentStory } from "@/lib/stories";

export const revalidate = 3600;

export async function GET() {
  const story = await getCurrentStory();
  return NextResponse.json(story);
}
