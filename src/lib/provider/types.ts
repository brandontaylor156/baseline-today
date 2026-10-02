// Our own shapes for tennis data. Everything outside src/lib/provider/ uses these, never a
// provider's response format, so the provider can be swapped without touching pages or the DB.

export type Tour = "atp" | "wta";

export const TOURS: readonly Tour[] = ["atp", "wta"];

export interface ProviderPlayer {
  tour: Tour;
  providerId: number;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  countryCode: string | null;
  countryName: string | null;
  birthPlace: string | null;
  plays: string | null;
  heightCm: number | null;
  weightKg: number | null;
  turnedPro: number | null;
}

export interface ProviderRanking {
  tour: Tour;
  rankingDate: string; // YYYY-MM-DD
  rank: number;
  points: number | null;
  movement: number | null;
  player: ProviderPlayer;
}

export interface TennisProvider {
  readonly name: string;
  /** Latest published singles ranking, best `limit` players. */
  getRankings(tour: Tour, limit: number): Promise<ProviderRanking[]>;
  /** Full profiles for the given provider player ids. */
  getPlayers(tour: Tour, providerIds: number[]): Promise<ProviderPlayer[]>;
}
