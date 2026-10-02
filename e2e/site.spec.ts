import { expect, test } from "@playwright/test";

test.describe("rankings", () => {
  test("home shows the ATP top 100 with links to players", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "ATP rankings" })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(100);
    await expect(rows.first().locator("td").first()).toContainText("1");
    await expect(page.getByText(/As of \d{1,2} [A-Z][a-z]{2} \d{4}/)).toBeVisible();
  });

  test("tour switch goes to the WTA rankings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Tour" }).getByRole("link", { name: "WTA" }).click();
    await expect(page).toHaveURL(/\/rankings\/wta$/);
    await expect(page.getByRole("heading", { level: 1, name: "WTA rankings" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Tour" }).getByRole("link", { name: "WTA" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("unknown tours are 404s; unknown snapshot dates show not-found and aren't indexed", async ({ page }) => {
    expect((await page.goto("/rankings/itf"))?.status()).toBe(404);
    // The date is only known to be missing after streaming starts, so this is a soft 404.
    await page.goto("/rankings/atp?date=1999-01-01");
    await expect(page.getByRole("heading", { name: "Out of bounds" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("the page never scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/", "/rankings/wta", "/credits"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("player page", () => {
  test("opens from the rankings with profile, stats and favorite button", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("tbody tr").first().getByRole("link");
    const name = (await first.locator("span.font-medium").textContent())!.trim();
    await first.click();

    await expect(page).toHaveURL(/\/players\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page).toHaveTitle(`${name} · Baseline Today`);
    await expect(page.getByText("Current rank", { exact: true })).toBeVisible();
    await expect(page.getByText("#1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Best tracked rank", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in to favorite/ })).toBeVisible();
  });

  test("photos are credited", async ({ page }) => {
    await page.goto("/");
    await page.locator("tbody tr").first().getByRole("link").click();
    const photo = page.locator("figure img");
    if ((await photo.count()) > 0) {
      await expect(page.locator("figcaption a").first()).toHaveAttribute("href", /commons\.wikimedia\.org/);
    } else {
      await expect(page.getByRole("img").first()).toBeVisible(); // initials avatar
    }
  });

  test("bad ids are 404s", async ({ page }) => {
    expect((await page.goto("/players/abc"))?.status()).toBe(404);
    expect((await page.goto("/players/999999999"))?.status()).toBe(404);
  });
});

test.describe("search", () => {
  test("live search suggests players and opens the chosen one", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: "Search players" });
    await box.fill("djokovic");
    const option = page.getByRole("option", { name: /Novak Djokovic/ });
    await expect(option).toBeVisible();
    await box.press("ArrowDown");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/players\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Novak Djokovic" })).toBeVisible();
  });

  test("results page is accent-insensitive", async ({ page }) => {
    await page.goto("/search?q=%C4%90okovi%C4%87"); // Đoković
    await expect(page.getByRole("link", { name: /Novak Djokovic/ })).toBeVisible();
  });

  test("results page explains short and unmatched queries", async ({ page }) => {
    await page.goto("/search?q=a");
    await expect(page.getByText("Type at least two letters")).toBeVisible();
    await page.goto("/search?q=zzzzqqq");
    await expect(page.getByText("No players match")).toBeVisible();
  });
});

test.describe("signed out", () => {
  test("header offers sign-in and My players asks to sign in", async ({ page }) => {
    await page.goto("/my-players");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Follow your players" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  });

  test("auth callback rejects bad codes and off-site redirects", async ({ request }) => {
    for (const path of ["/auth/callback?code=bogus&next=/my-players", "/auth/callback?next=//evil.example"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toMatch(/\/auth\/error$/);
    }
  });

  test("cron endpoint requires the secret", async ({ request }) => {
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
    expect((await request.get("/api/cron/daily", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  });
});

test("credits list photo authors and licenses", async ({ page }) => {
  await page.goto("/credits");
  await expect(page.getByRole("heading", { name: "Player photos" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^CC|Public domain/ }).first()).toBeVisible();
});
