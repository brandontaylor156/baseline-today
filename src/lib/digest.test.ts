import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/bot", () => ({ digestText: async () => "" }));

const { webhookKind } = await import("./digest");

describe("webhookKind", () => {
  it("accepts only Discord and Slack webhook addresses over https", () => {
    expect(webhookKind("https://discord.com/api/webhooks/1/abc")).toBe("discord");
    expect(webhookKind("https://hooks.slack.com/services/T/B/x")).toBe("slack");
    expect(webhookKind("http://discord.com/api/webhooks/1/abc")).toBeNull();
    expect(webhookKind("https://discord.com.evil.test/api/webhooks/1")).toBeNull();
    expect(webhookKind("https://169.254.169.254/latest")).toBeNull();
    expect(webhookKind("not a url")).toBeNull();
  });
});
