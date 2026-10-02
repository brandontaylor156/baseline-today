import { expect, test } from "@playwright/test";

test.describe("rankings", () => {
  test("ATP rankings show the top 100 with links to players", async ({ page }) => {
    await page.goto("/rankings/atp");
    await expect(page.getByRole("heading", { level: 1, name: "ATP rankings" })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(100);
    await expect(rows.first().locator("td").first()).toContainText("1");
    // With stored history the date is a snapshot picker, newest week selected.
    const picker = page.getByLabel("As of");
    await expect(picker).toBeVisible();
    await expect(picker.locator("option:checked")).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
    expect(await picker.locator("option").count()).toBeGreaterThan(10);
  });

  test("tour switch goes to the WTA rankings", async ({ page }) => {
    await page.goto("/rankings/atp");
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
    for (const path of ["/", "/rankings/wta", "/credits", "/pickem", "/ratings", "/race", "/tournaments/752"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("player page", () => {
  test("opens from the rankings with profile, stats and favorite button", async ({ page }) => {
    await page.goto("/rankings/atp");
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
    await page.goto("/rankings/atp");
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

test("privacy page is linked from every page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(page.getByText("no analytics, advertising or third-party tracking cookies", { exact: false })).toBeVisible();
});

test("live scores stay hidden until switched on", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Scores" })).toHaveCount(0);
  expect((await request.get("/scores")).status()).toBe(404);
  expect((await request.get("/api/live/refresh")).status()).toBe(404);
  expect((await request.get("/api/trial/espn")).status()).toBe(404);
});

test("results page lists finished matches with Wikipedia credit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Results" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByRole("heading", { level: 1, name: "Results" })).toBeVisible();
  await expect(page.getByText("Not live.", { exact: false })).toBeVisible();
  const credit = page.getByRole("link", { name: "CC BY-SA 4.0" }).first();
  if ((await page.locator("article").count()) > 0) {
    await expect(credit).toHaveAttribute("href", /creativecommons\.org\/licenses\/by-sa\/4\.0/);
    await expect(page.locator('a[href*="en.wikipedia.org/wiki/"]').first()).toBeVisible();
  }
});

test.describe("tournaments", () => {
  test("calendar lists events and opens a tournament", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Events" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tournaments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Full season" })).toBeVisible();
    const first = page.locator("section[aria-label='Full season'] details[open] a").first();
    await first.click();
    await expect(page).toHaveURL(/\/tournaments\/\d+$/);
    await expect(page.getByRole("link", { name: "← Tournaments" })).toBeVisible();
  });

  test("unknown tournaments are 404s", async ({ page }) => {
    expect((await page.goto("/tournaments/999999999"))?.status()).toBe(404);
  });
});

test.describe("player extras", () => {
  test("ranking history chart with a table view", async ({ page }) => {
    await page.goto("/rankings/atp");
    await page.locator("tbody tr").first().getByRole("link").click();
    await expect(page.getByRole("heading", { name: "Ranking history" })).toBeVisible();
    await page.getByText("Show as table").first().click();
    await expect(page.locator("table caption", { hasText: "rank by week" })).toBeAttached();
  });

  test("share card is a PNG", async ({ page, request }) => {
    await page.goto("/rankings/atp");
    const href = await page.locator("tbody tr").first().getByRole("link").getAttribute("href");
    const res = await request.get(`${href}/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });

  test("head-to-head from a player page", async ({ page }) => {
    await page.goto("/rankings/atp");
    await page.locator("tbody tr").first().getByRole("link").click();
    await page.getByRole("link", { name: "Head-to-head" }).click();
    await expect(page).toHaveURL(/\/h2h\?a=\d+$/);
    await page.getByLabel("Compare with").fill("zverev");
    await page.getByRole("button", { name: /Zverev/ }).first().click();
    await expect(page).toHaveURL(/\/h2h\?a=\d+&b=\d+$/);
    await expect(page.getByRole("heading", { name: /Meetings/ })).toBeVisible();
  });
});

test("odds page shows predictions with the betting disclaimer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Odds" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Odds and predictions" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Estimates, not betting advice");
  await expect(page.getByRole("note")).toContainText("18+");
});

test("home shows this week: top 10s and movers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("This week in tennis")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ATP top 10" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WTA top 10" })).toBeVisible();
  await page.getByRole("link", { name: "Full rankings →" }).first().click();
  await expect(page).toHaveURL(/\/rankings\/atp$/);
});

test("stats and countries pages", async ({ page }) => {
  await page.goto("/stats?tour=wta");
  await expect(page.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most wins" })).toBeVisible();
  await page.goto("/countries");
  await page.locator("main a[href^=\"/countries/\"]").first().click();
  await expect(page).toHaveURL(/\/countries\/[A-Z]{3}$/);
  await expect(page.getByRole("link", { name: "← Countries" })).toBeVisible();
});

test.describe("installable app", () => {
  test("manifest with icons, and a fresh service worker", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    for (const icon of manifest.icons) {
      const res = await request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
    }
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-store");
    expect(await sw.text()).toContain("notificationclick");
  });

  test("offline page exists and isn't indexed", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { level: 1, name: "You’re offline" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("push subscriptions need a signed-in user", async ({ request }) => {
    const body = { endpoint: "https://push.test.invalid/x", keys: { p256dh: "k", auth: "a" } };
    const post = await request.post("/api/push/subscribe", { data: body });
    expect([401, 404]).toContain(post.status());
    expect((await request.delete("/api/push/subscribe", { data: body })).status()).toBe(401);
  });
});

test("model ratings: table, surface switch and accuracy", async ({ page }) => {
  await page.goto("/stats");
  await page.getByRole("link", { name: "Model ratings →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Model ratings" })).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(10);
  await page.getByRole("navigation", { name: "Surface" }).getByRole("link", { name: "Clay" }).click();
  await expect(page).toHaveURL(/surface=clay/);
  await expect(page.getByRole("heading", { name: /Top 50 · Clay/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How accurate is it?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week’s track record" })).toBeVisible();
});

test("player page shows this season's tournaments and the model rating", async ({ page }) => {
  await page.goto("/rankings/atp");
  await page.locator("tbody tr").first().getByRole("link").click();
  const year = new Date().getUTCFullYear();
  await expect(page.getByRole("heading", { name: `${year} tournaments` })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model rating" })).toBeVisible();
  await page.getByText("Show as table").nth(1).click();
  await expect(page.locator("table caption", { hasText: "Model rating by week" })).toBeAttached();
});

test("robots and sitemap", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /my-players");
  expect(robots).toContain("/sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("/players/");
  expect(xml).toContain("/tournaments/");
});

test("title chances on a tournament in progress", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("a", { hasText: "Favorite:" }).first();
  test.skip((await card.count()) === 0, "no tournament in progress with a readable draw");
  await card.click();
  await expect(page).toHaveURL(/\/tournaments\/\d+$/);
  await expect(page.getByRole("heading", { name: "Title chances", exact: true })).toBeVisible();
  const first = page.locator("#title-heading ~ div tbody tr").first();
  await expect(first).toContainText("%");
  // What if: pick a winner, the table switches to the scenario; reset brings it back.
  const pick = page.getByRole("button", { name: /^Pick .* to win$/ }).first();
  if ((await pick.count()) > 0) {
    await pick.click();
    await expect(page.getByRole("heading", { name: /with your picks/ })).toBeVisible();
    await page.getByRole("button", { name: /^Reset/ }).click();
    await expect(page.getByRole("heading", { name: /with your picks/ })).toHaveCount(0);
  }
});

test("pick'em: open matches, leaderboards, sign-in prompt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pick’em" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pick’em" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("season race with the qualifying line", async ({ page }) => {
  await page.goto("/stats");
  await page.getByRole("link", { name: "Season race →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /season race/ })).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(8);
  await page.getByRole("navigation", { name: "Tour" }).getByRole("link", { name: "WTA" }).click();
  await expect(page).toHaveURL(/tour=wta/);
});

test("matchup share card and calendar feeds", async ({ page, request }) => {
  await page.goto("/rankings/atp");
  const hrefs = await page.locator("tbody tr a").evaluateAll((as) => as.slice(0, 2).map((a) => a.getAttribute("href")!));
  const [a, b] = hrefs.map((h) => h.split("/").pop());
  await page.goto(`/h2h?a=${a}&b=${b}`);
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toContain(`/h2h/card?a=${a}&b=${b}`);
  const card = await request.get(`/h2h/card?a=${a}&b=${b}`);
  expect(card.headers()["content-type"]).toBe("image/png");

  const feed = await request.get(`/calendar/players/${a}.ics`);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  expect(await feed.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect((await request.get("/calendar/wta.ics")).status()).toBe(200);
  expect((await request.get("/calendar/itf.ics")).status()).toBe(404);
});

test("match pages: preview from Up next, result from a result card", async ({ page, request }) => {
  await page.goto("/odds");
  const preview = page.locator('a[href^="/matches/"]', { hasText: "Preview" }).first();
  if ((await preview.count()) > 0) {
    await preview.click();
    await expect(page).toHaveURL(/\/matches\/\d+$/);
    await expect(page.getByText("Match preview")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Form" })).toBeVisible();
    const og = await request.get(`${new URL(page.url()).pathname}/opengraph-image`);
    expect(og.headers()["content-type"]).toBe("image/png");
  }
  await page.goto("/results");
  await page.locator('article a[href^="/matches/"]').first().click();
  await expect(page).toHaveURL(/\/matches\/\d+$/);
  await expect(page.getByText("Result", { exact: true })).toBeVisible();
  expect((await request.get("/matches/999999999")).status()).toBe(404);
});
