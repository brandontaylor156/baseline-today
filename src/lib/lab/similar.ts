// Player similarity from results profiles (pure, unit tested): each trait standardized across the
// field (z-scores; a missing trait counts as average), then distance between players.

export interface Profile {
  player_id: number;
  name: string;
  country: string | null;
  matches: number;
  win_rate: number;
  tiebreak_rate: number | null;
  deciding_rate: number | null;
  comeback_rate: number | null;
  underdog_rate: number | null;
  favourite_rate: number | null;
  straight_share: number | null;
  game_share: number | null;
  hard_edge: number | null;
  clay_edge: number | null;
  grass_edge: number | null;
}

/** The traits compared, with how they read in a sentence. */
export const TRAITS = [
  { key: "game_share", label: "share of games won" },
  { key: "straight_share", label: "wins in straight sets" },
  { key: "tiebreak_rate", label: "tiebreaks won" },
  { key: "deciding_rate", label: "deciding sets won" },
  { key: "comeback_rate", label: "comebacks after losing the first set" },
  { key: "underdog_rate", label: "wins as the underdog" },
  { key: "favourite_rate", label: "wins as the favourite" },
  { key: "hard_edge", label: "hard-court edge" },
  { key: "clay_edge", label: "clay edge" },
  { key: "grass_edge", label: "grass edge" },
] as const;

type TraitKey = (typeof TRAITS)[number]["key"];

/** z-scores of every trait for every player. */
export function standardize(profiles: Profile[]): Map<number, Record<TraitKey, number>> {
  const stats = new Map<TraitKey, { mean: number; sd: number }>();
  for (const { key } of TRAITS) {
    const vals = profiles.map((p) => p[key]).filter((v): v is number => v !== null && Number.isFinite(v));
    const mean = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length)) || 1;
    stats.set(key, { mean, sd });
  }
  return new Map(
    profiles.map((p) => [
      p.player_id,
      Object.fromEntries(TRAITS.map(({ key }) => [key, p[key] === null ? 0 : (p[key]! - stats.get(key)!.mean) / stats.get(key)!.sd])) as Record<TraitKey, number>,
    ]),
  );
}

export interface Match {
  profile: Profile;
  /** 0–100: 100 = identical profile. */
  similarity: number;
  shared: string[];
  differs: { label: string; more: boolean } | null;
}

/** The players whose profiles are closest, with the traits they share and the biggest difference. */
export function mostSimilar(id: number, profiles: Profile[], limit = 8): Match[] {
  const z = standardize(profiles);
  const me = z.get(id);
  if (!me) return [];
  return profiles
    .filter((p) => p.player_id !== id)
    .map((p) => {
      const other = z.get(p.player_id)!;
      const gaps = TRAITS.map((t) => ({ t, gap: other[t.key] - me[t.key] }));
      const distance = Math.sqrt(gaps.reduce((s, g) => s + g.gap ** 2, 0) / TRAITS.length);
      const sorted = [...gaps].sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
      const biggest = sorted.at(-1)!;
      return {
        profile: p,
        similarity: Math.round(100 / (1 + distance)),
        // Shared: close on traits where they both stand out from the field.
        shared: sorted.filter((g) => Math.abs(g.gap) < 0.35 && Math.abs(me[g.t.key]) > 0.6).slice(0, 3).map((g) => g.t.label),
        differs: Math.abs(biggest.gap) > 0.8 ? { label: biggest.t.label, more: biggest.gap > 0 } : null,
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** A player's standout traits, strongest first (|z| ≥ 1). */
export function standouts(id: number, profiles: Profile[]): { label: string; high: boolean; z: number }[] {
  const me = standardize(profiles).get(id);
  if (!me) return [];
  return TRAITS.map((t) => ({ label: t.label, high: me[t.key] > 0, z: me[t.key] }))
    .filter((x) => Math.abs(x.z) >= 1)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}
