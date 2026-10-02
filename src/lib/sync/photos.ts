import "server-only";

import { lookupPlayer } from "@/lib/photos/wikimedia";
import type { Tour } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";

import { staleBefore } from "./rows";

const RECHECK_DAYS = 30;
// One at a time: Wikidata rate-limits parallel clients, and the daily batch is small.
const CONCURRENCY = 1;

export interface PhotoSyncSummary {
  checked: number;
  withPhoto: number;
  matched: number;
  failed: number;
}

/**
 * Rotating Wikimedia lookup: players never checked or checked over 30 days ago, oldest first.
 * Stores the Wikidata id, a day-precision birth date (the provider has none) and a credited photo.
 */
export async function runPhotoSync(db: AdminClient, limit: number, now = new Date()): Promise<PhotoSyncSummary> {
  const { data: players, error } = await db
    .from("players")
    .select("id, tour, full_name, wikidata_id, birth_date")
    .or(`image_checked_at.is.null,image_checked_at.lt.${staleBefore(now, RECHECK_DAYS)}`)
    .order("image_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`find players for photos: ${error.message}`);

  const summary: PhotoSyncSummary = { checked: 0, withPhoto: 0, matched: 0, failed: 0 };
  const queue = [...(players ?? [])];

  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const found = await lookupPlayer(p.full_name, p.tour as Tour, p.wikidata_id);
        const checkedAt = now.toISOString();

        const update = await db
          .from("players")
          .update({
            wikidata_id: found.wikidataId ?? p.wikidata_id,
            birth_date: p.birth_date ?? found.birthDate,
            image_checked_at: checkedAt,
          })
          .eq("id", p.id);
        if (update.error) throw new Error(update.error.message);

        const image = found.image
          ? await db.from("player_images").upsert({
              player_id: p.id,
              image_url: found.image.imageUrl,
              source_url: found.image.sourceUrl,
              author: found.image.author,
              license: found.image.license,
              license_url: found.image.licenseUrl,
              fetched_at: checkedAt,
            })
          : await db.from("player_images").delete().eq("player_id", p.id);
        if (image.error) throw new Error(image.error.message);

        summary.checked++;
        if (found.wikidataId) summary.matched++;
        if (found.image) summary.withPhoto++;
      } catch (err) {
        summary.failed++;
        console.error(`photo sync: ${p.full_name}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}
