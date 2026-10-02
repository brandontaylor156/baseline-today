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

export interface ProviderTournament {
  tour: Tour;
  providerId: number;
  name: string;
  location: string | null;
  surface: string | null;
  category: string | null;
  season: number | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  drawSize: number | null;
}

export type MatchStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "canceled"
  | "delayed"
  | "suspended"
  | "abandoned"
  | "unknown";

export interface SetScore {
  set: number;
  p1: number | null;
  p2: number | null;
  p1Tiebreak: number | null;
  p2Tiebreak: number | null;
}

export interface ProviderMatch {
  tour: Tour;
  providerId: number;
  tournament: ProviderTournament;
  season: number | null;
  round: string | null;
  player1: ProviderPlayer | null;
  player2: ProviderPlayer | null;
  /** 1 or 2 when finished, else null. */
  winner: 1 | 2 | null;
  status: MatchStatus;
  /** walkover, retired or defaulted when the provider says so. */
  resultDetail: string | null;
  isLive: boolean;
  score: string | null;
  sets: SetScore[];
  p1GameScore: string | null;
  p2GameScore: string | null;
  server: string | null;
  scheduledAt: string | null; // ISO
  notBeforeText: string | null;
  duration: string | null;
}

export interface TennisProvider {
  readonly name: string;
  /**
   * Singles ranking, best `limit` players: the latest, or the snapshot in effect on `date`
   * (YYYY-MM-DD; the provider returns the nearest earlier ranking week).
   */
  getRankings(tour: Tour, limit: number, date?: string): Promise<ProviderRanking[]>;
  /** Full profiles for the given provider player ids. */
  getPlayers(tour: Tour, providerIds: number[]): Promise<ProviderPlayer[]>;
  /** All tournaments of a season (free tier). */
  getTournaments(tour: Tour, season: number): Promise<ProviderTournament[]>;
  /** Matches of the given tournaments (paid tier). */
  getMatches(tour: Tour, tournamentProviderIds: number[]): Promise<ProviderMatch[]>;
  /** Matches in progress right now (paid tier). */
  getLiveMatches(tour: Tour): Promise<ProviderMatch[]>;
}
