import { describe, expect, it } from "vitest";

import type { ProviderPlayer } from "@/lib/provider/types";

import { playerRow, profileRow, staleBefore } from "./rows";

const sinner: ProviderPlayer = {
  tour: "atp",
  providerId: 7,
  firstName: "Jannik",
  lastName: "Sinner",
  fullName: "Jannik Sinner",
  countryCode: "ITA",
  countryName: "Italy",
  birthPlace: "San Candido, Italy",
  plays: "Right-Handed",
  heightCm: 191,
  weightKg: 77,
  turnedPro: 2018,
};

describe("player rows", () => {
  it("maps provider fields to columns without refresh stamps", () => {
    const row = playerRow(sinner, "balldontlie");
    expect(row).toMatchObject({ tour: "atp", provider: "balldontlie", provider_id: 7, full_name: "Jannik Sinner", height_cm: 191 });
    expect(row).not.toHaveProperty("profile_refreshed_at");
  });

  it("stamps profile rows with the refresh time", () => {
    const now = new Date("2026-10-02T06:00:00Z");
    expect(profileRow(sinner, "balldontlie", now)).toMatchObject({
      profile_refreshed_at: "2026-10-02T06:00:00.000Z",
      updated_at: "2026-10-02T06:00:00.000Z",
    });
  });

  it("computes the staleness cutoff", () => {
    expect(staleBefore(new Date("2026-10-08T06:00:00Z"), 7)).toBe("2026-10-01T06:00:00.000Z");
  });
});
