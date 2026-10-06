import { describe, expect, it } from "vitest";

import { ago, alertFor, jobHealth } from "./ops";

const now = new Date("2026-10-05T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe("jobHealth", () => {
  it("is ok while the last success is recent, stale after the limit", () => {
    expect(jobHealth({ key: "results", last_refreshed_at: minutesAgo(12), status: "ok" }, 60, now)).toBe("ok");
    expect(jobHealth({ key: "results", last_refreshed_at: minutesAgo(61), status: "ok" }, 60, now)).toBe("stale");
  });

  it("reports a failed last run even when an older success is recent", () => {
    expect(jobHealth({ key: "daily", last_refreshed_at: minutesAgo(5), status: "error" }, 1560, now)).toBe("error");
    expect(jobHealth({ key: "daily", last_refreshed_at: null, status: "error" }, 1560, now)).toBe("error");
  });

  it("is never for missing rows and jobs that never succeeded", () => {
    expect(jobHealth(undefined, 60, now)).toBe("never");
    expect(jobHealth({ key: "results", last_refreshed_at: null, status: null }, 60, now)).toBe("never");
  });
});

describe("ago", () => {
  it("rounds to minutes, hours and days", () => {
    expect(ago(null, now)).toBe("never");
    expect(ago(minutesAgo(0.2), now)).toBe("just now");
    expect(ago(minutesAgo(7), now)).toBe("7 min ago");
    expect(ago(minutesAgo(180), now)).toBe("3 h ago");
    expect(ago(minutesAgo(3 * 24 * 60), now)).toBe("3 d ago");
  });
});

describe("alertFor", () => {
  it("alerts on the first failure and on recovery, not on repeats", () => {
    expect(alertFor("results refresh", "ok", "error", "timeout")).toBe("⚠️ Baseline Today: results refresh failed: timeout");
    expect(alertFor("results refresh", "error", "error")).toBeNull();
    expect(alertFor("results refresh", "error", "ok")).toBe("✅ Baseline Today: results refresh recovered");
    expect(alertFor("results refresh", "ok", "ok")).toBeNull();
    expect(alertFor("results refresh", null, "error")).toContain("failed");
  });
});
