// Feature switches read from the environment (server only).

/** Live scores need the paid provider tier (or its trial); off by default. */
export function liveScoresEnabled(): boolean {
  return process.env.LIVE_SCORES_ENABLED === "1";
}

/** Trial measurement: provider and ESPN observations for the lag report. */
export function trialSamplingEnabled(): boolean {
  return process.env.TRIAL_SAMPLING === "1";
}

/** Bookmaker odds (BALLDONTLIE GOAT tier, also available during its 48-hour trial). */
export function oddsEnabled(): boolean {
  return process.env.ODDS_ENABLED === "1";
}
