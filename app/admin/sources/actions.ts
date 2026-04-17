"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";

/**
 * Replace a city's rss_feeds array. `feeds_text` is newline-separated URLs
 * (user-editable textarea). Lines starting with `#` are treated as comments
 * and dropped. Empty lines dropped.
 */
export async function updateCityFeeds(formData: FormData): Promise<void> {
  const cityId = String(formData.get("city_id") ?? "").trim();
  const feedsText = String(formData.get("feeds") ?? "");

  if (!cityId) {
    redirect("/admin/sources?err=missing-city-id");
  }

  const feeds = feedsText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => (l.startsWith("http") ? l : `https://${l}`));

  const sql = requireSql();
  await sql`
    update cities set rss_feeds = ${feeds} where id = ${cityId}
  `;

  revalidatePath("/admin/sources");
  redirect(`/admin/sources?updated=${encodeURIComponent(cityId)}#${cityId}`);
}

/** Toggle is_active so pickCity() skips this city. */
export async function toggleCityActive(formData: FormData): Promise<void> {
  const cityId = String(formData.get("city_id") ?? "").trim();
  if (!cityId) redirect("/admin/sources");

  const sql = requireSql();
  await sql`
    update cities set is_active = not is_active where id = ${cityId}
  `;
  revalidatePath("/admin/sources");
  redirect(`/admin/sources#${cityId}`);
}
