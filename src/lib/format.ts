import type { Tour } from "@/lib/provider/types";

export const TOUR_LABEL: Record<Tour, string> = { atp: "ATP", wta: "WTA" };
export const TOUR_NAME: Record<Tour, string> = { atp: "Men's singles", wta: "Women's singles" };

export function isTour(value: string): value is Tour {
  return value === "atp" || value === "wta";
}

export function initials(fullName: string): string {
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function formatPoints(points: number | null): string {
  return points === null ? "–" : points.toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "28 Sep 2026" from YYYY-MM-DD. Hand-formatted: identical on server and client, any ICU version. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatHeight(cm: number | null): string | null {
  if (!cm) return null;
  const totalInches = Math.round(cm / 2.54);
  return `${cm} cm (${Math.floor(totalInches / 12)}′${totalInches % 12}″)`;
}

export function formatWeight(kg: number | null): string | null {
  return kg ? `${kg} kg (${Math.round(kg * 2.20462)} lb)` : null;
}

export function formatPlays(plays: string | null): string | null {
  if (!plays) return null;
  return plays.replace(/-Handed/, "-handed");
}

/** Positive movement = climbed. Returns a label for screen readers and a compact visual form. */
export function describeMovement(movement: number | null): { label: string; short: string; direction: "up" | "down" | "none" } {
  if (!movement) return { label: "No change", short: "–", direction: "none" };
  const places = Math.abs(movement);
  const plural = places === 1 ? "place" : "places";
  return movement > 0
    ? { label: `Up ${places} ${plural}`, short: `▲${places}`, direction: "up" }
    : { label: `Down ${places} ${plural}`, short: `▼${places}`, direction: "down" };
}

/** Best (lowest) rank in tracked history, with the first date it was reached. */
export function bestRank(history: { date: string; rank: number }[]): { rank: number; date: string } | null {
  let best: { rank: number; date: string } | null = null;
  for (const h of history) if (!best || h.rank < best.rank) best = { rank: h.rank, date: h.date };
  return best;
}
