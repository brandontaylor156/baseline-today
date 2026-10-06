// Open data downloads (pure, unit tested): results (from Wikipedia draw pages, CC BY-SA 4.0) and our
// model ratings. BALLDONTLIE rankings are never included: their terms don't allow redistribution.

export const FIRST_SEASON = 2015;

export type DataFile =
  | { kind: "results"; season: number; format: "csv" | "json" }
  | { kind: "ratings"; format: "csv" | "json" }
  | { kind: "title-chances"; season: number; format: "csv" | "json" };

/** "results-2026.csv", "ratings.json" → what to serve, or null. */
export function parseDataFile(name: string, currentSeason: number): DataFile | null {
  const results = /^results-(\d{4})\.(csv|json)$/.exec(name);
  if (results) {
    const season = Number(results[1]);
    return season >= FIRST_SEASON && season <= currentSeason ? { kind: "results", season, format: results[2] as "csv" | "json" } : null;
  }
  const chances = /^title-chances-(\d{4})\.(csv|json)$/.exec(name);
  if (chances) {
    const season = Number(chances[1]);
    return season >= FIRST_SEASON && season <= currentSeason ? { kind: "title-chances", season, format: chances[2] as "csv" | "json" } : null;
  }
  const ratings = /^ratings\.(csv|json)$/.exec(name);
  return ratings ? { kind: "ratings", format: ratings[1] as "csv" | "json" } : null;
}

/** RFC 4180 CSV; cells starting with = + - @ are prefixed with ' so spreadsheets never run them. */
export function toCsv(columns: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const RESULT_COLUMNS = [
  "match_id",
  "season",
  "tour",
  "tournament_id",
  "tournament",
  "tournament_start",
  "surface",
  "round",
  "winner",
  "winner_country",
  "loser",
  "loser_country",
  "score",
  "walkover",
  "retired",
  "model_winner_chance",
  "source",
  "license",
];

export const TITLE_CHANCE_COLUMNS = ["tournament_id", "tournament", "tour", "category", "season", "player", "player_id", "rating", "title_chance", "champion", "champion_path_chance", "source", "license"];

export const RATING_COLUMNS = ["tour", "player", "country", "elo", "elo_hard", "elo_clay", "elo_grass", "matches", "source", "license"];

/** Attribution carried in every row and file, so it survives any download or copy. */
export const LICENSE_NAME = "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)";
export const CREDIT = {
  results:
    "Match results from Wikipedia draw pages by Wikipedia contributors (https://www.wikipedia.org), licensed CC BY-SA 4.0. Compiled by Baseline Today (https://baseline-today.vercel.app/data); this file is shared under the same license, CC BY-SA 4.0. The source column links each result's draw page.",
  ratings:
    "Elo ratings computed by Baseline Today (https://baseline-today.vercel.app/data) from match results on Wikipedia draw pages by Wikipedia contributors (https://www.wikipedia.org), licensed CC BY-SA 4.0. This file is shared under the same license, CC BY-SA 4.0.",
};
export const RATINGS_SOURCE = "Baseline Today, computed from Wikipedia results (https://baseline-today.vercel.app/data)";
