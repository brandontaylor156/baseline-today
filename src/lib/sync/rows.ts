// Pure conversions from provider types to database rows.

import type { ProviderPlayer } from "@/lib/provider/types";
import type { TablesInsert } from "@/lib/supabase/database.types";

export function playerRow(p: ProviderPlayer, provider: string): TablesInsert<"players"> {
  return {
    tour: p.tour,
    provider,
    provider_id: p.providerId,
    first_name: p.firstName,
    last_name: p.lastName,
    full_name: p.fullName,
    country_code: p.countryCode,
    country_name: p.countryName,
    birth_place: p.birthPlace,
    plays: p.plays,
    height_cm: p.heightCm,
    weight_kg: p.weightKg,
    turned_pro: p.turnedPro,
  };
}

/** Profile rows from the players endpoint: authoritative, so they overwrite and stamp the refresh time. */
export function profileRow(p: ProviderPlayer, provider: string, now: Date): TablesInsert<"players"> {
  return { ...playerRow(p, provider), profile_refreshed_at: now.toISOString(), updated_at: now.toISOString() };
}

export function staleBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
