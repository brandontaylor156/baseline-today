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
  await expect(page.getByText("no advertising or third-party tracking cookies", { exact: false })).toBeVisible();
  await expect(page.getByText("They use no cookies", { exact: false })).toBeVisible();
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
    // A complete pair moves to its readable, canonical address.
    await expect(page).toHaveURL(/\/h2h\/[a-z0-9-]+-vs-[a-z0-9-]+-\d+-\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: / vs .*Zverev|Zverev.* vs / })).toBeVisible();
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
  expect(xml).toMatch(/\/h2h\/[a-z0-9-]+-vs-[a-z0-9-]+-\d+-\d+</);
  expect(xml).toContain("/week/");
});

test("title chances on a tournament in progress", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("a", { hasText: "Favorite:" }).first();
  test.skip((await card.count()) === 0, "no tournament in progress with a readable draw");
  await card.click();
  await expect(page).toHaveURL(/\/tournaments\/\d+$/);
  await expect(page.getByRole("heading", { name: "Title chances", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Draw difficulty" })).toBeVisible();
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
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Play" }).click();
  await page.getByRole("main").getByRole("link", { name: "Pick’em" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pick’em" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("season race with the qualifying line", async ({ page }) => {
  await page.goto("/stats");
  await page.getByRole("link", { name: "Season race →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /season race/ })).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(8);
  await expect(page.getByRole("columnheader", { name: "Finals chance" })).toBeVisible();
  await page.getByRole("navigation", { name: "Tour" }).getByRole("link", { name: "WTA" }).click();
  await expect(page).toHaveURL(/tour=wta/);
});

test("matchup share card and calendar feeds", async ({ page, request }) => {
  await page.goto("/rankings/atp");
  const hrefs = await page.locator("tbody tr a").evaluateAll((as) => as.slice(0, 2).map((a) => a.getAttribute("href")!));
  const [a, b] = hrefs.map((h) => h.split("/").pop());
  await page.goto(`/h2h?a=${a}&b=${b}`);
  const og = (await page.locator('meta[property="og:image"]').getAttribute("content"))!;
  expect(og).toMatch(/\/h2h\/card\?a=\d+&b=\d+/);
  expect(og).toContain(`=${a}`);
  expect(og).toContain(`=${b}`);
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

test("private leagues ask signed-out visitors to sign in, keeping the invite code", async ({ page }) => {
  await page.goto("/pickem");
  await page.getByRole("link", { name: "Private leagues →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Private leagues" })).toBeVisible();
  await page.goto("/leagues?join=ABCD1234");
  await expect(page.getByText("code ABCD1234")).toBeVisible();
});

test("widgets: embeddable rankings, linked from the footer; bot endpoint off without keys", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Widgets" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Widgets" })).toBeVisible();
  const embed = await request.get("/embed/rankings/wta");
  expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");
  expect(await embed.text()).toContain("WTA top 10");
  expect((await request.get("/embed/rankings/itf")).status()).toBe(404);
  expect((await request.post("/api/discord", { data: {} })).status()).toBe(404);
});

test("watch parties: start from a match, invite links ask to sign in, bad codes 404", async ({ page, request }) => {
  await page.goto("/odds");
  const preview = page.locator('a[href^="/matches/"]', { hasText: "Preview" }).first();
  if ((await preview.count()) > 0) {
    await preview.click();
    await expect(page.getByRole("heading", { name: "Watch it together" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to start a party" })).toBeVisible();
  }
  await page.goto("/party/ABCD2345");
  await expect(page.getByText("to join this watch party")).toBeVisible();
  expect((await request.get("/party/nope")).status()).toBe(404);
});

test("status page shows each background job and data freshness, linked from the footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Status" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Status" })).toBeVisible();
  for (const job of ["Results from Wikipedia", "Daily rankings sync", "Rating model"]) {
    await expect(page.getByText(job, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("ATP rankings")).toBeVisible();
  await expect(page.getByText(/^(Healthy|Behind|Failing|Not run yet)$/).first()).toBeVisible();
});

test("guest pick'em: picks without an account are kept in the browser", async ({ page }) => {
  await page.goto("/pickem");
  const first = page.locator('section[aria-labelledby="open-heading"] li button').first();
  test.skip((await first.count()) === 0, "no open matches right now");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("You’ve made 1 pick as a guest")).toBeVisible();
  await page.reload();
  await expect(page.locator('section[aria-labelledby="open-heading"] li button[aria-pressed="true"]')).toHaveCount(1);
});

test("leagues show real strategy benchmarks to signed-out visitors", async ({ page }) => {
  await page.goto("/leagues");
  await expect(page.getByRole("heading", { name: "Benchmarks to beat" })).toBeVisible();
  await expect(page.getByText("Always picks the model's favorite", { exact: true })).toBeVisible();
});

test("watch party page explains parties and shows a real match set by set", async ({ page }) => {
  await page.goto("/pickem");
  await page.getByRole("link", { name: "How watch parties work →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How watch parties work" })).toBeVisible();
  await expect(page.getByText(/nothing simulated/)).toBeVisible();
});

test("readable head-to-head addresses: biggest rivalries, redirects and structured data", async ({ page, request }) => {
  await page.goto("/h2h");
  const rivalry = page.getByRole("region", { name: "Biggest rivalries" }).getByRole("link").first();
  await expect(rivalry).toBeVisible();
  const href = (await rivalry.getAttribute("href"))!;
  expect(href).toMatch(/^\/h2h\/[a-z0-9-]+-vs-[a-z0-9-]+-\d+-\d+$/);
  // A wrong name in the slug redirects to the canonical one; the old query form does too.
  const [, x, y] = /-(\d+)-(\d+)$/.exec(href)!;
  const wrong = await request.get(`/h2h/someone-vs-else-${x}-${y}`, { maxRedirects: 0 });
  expect([301, 308]).toContain(wrong.status());
  expect(wrong.headers()["location"]).toContain(href);
  const old = await request.get(`/h2h?a=${y}&b=${x}`, { maxRedirects: 0 });
  expect(old.headers()["location"]).toContain(href);
  expect((await request.get("/h2h/nope")).status()).toBe(404);
  await rivalry.click();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${href}$`));
  // Big rivalries chart who has had the edge, with their meetings marked.
  await expect(page.getByRole("heading", { name: /’s edge over time$/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /chance against .* by week/ })).toBeVisible();
});

test("structured data on player, match and tournament pages", async ({ page }) => {
  await page.goto("/rankings/atp");
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/players\/\d+$/);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2);
  const ld = async () => (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t)["@type"]);
  expect(await ld()).toEqual(expect.arrayContaining(["WebSite", "Person"]));
  await page.goto("/tournaments");
  await page.locator('main a[href^="/tournaments/"]').first().click();
  await expect(page).toHaveURL(/\/tournaments\/\d+$/);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2);
  expect(await ld()).toContain("SportsEvent");
});

test("weekly recap: list, a week with champions, linked from the homepage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Week-by-week recaps →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Week in tennis" })).toBeVisible();
  await page.locator('main a[href^="/week/"]').first().click();
  await expect(page.getByRole("heading", { name: "Champions" })).toBeVisible();
  await expect(page.getByText("🏆").first()).toBeVisible();
  expect((await page.request.get("/week/2026-09-29")).status()).toBe(404);
});

test("open data downloads, RSS feed, IndexNow key and the case study", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Open data" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Open tennis data" })).toBeVisible();
  const ratings = await request.get("/data/ratings.csv");
  expect(ratings.headers()["content-type"]).toContain("text/csv");
  expect(ratings.headers()["content-disposition"]).toContain("attachment");
  const [header, first] = (await ratings.text()).split("\r\n");
  expect(header).toBe("tour,player,country,elo,elo_hard,elo_clay,elo_grass,matches,source,license");
  expect(first).toContain("CC BY-SA 4.0");
  // Credit travels with the data: every row names its Wikipedia page and the license.
  const json = await (await request.get(`/data/results-${new Date().getUTCFullYear()}.json`)).json();
  expect(json.license).toContain("CC BY-SA 4.0");
  expect(json.attribution).toContain("Wikipedia contributors");
  expect(json.count).toBeGreaterThan(100);
  expect(Object.keys(json.data[0])).toContain("model_winner_chance");
  expect(json.data[0].source).toMatch(/^https:\/\/[a-z]+\.wikipedia\.org\//);
  expect(json.data[0].license).toContain("CC BY-SA 4.0");
  expect((await request.get("/data/rankings.csv")).status()).toBe(404);

  const feed = await request.get("/feed.xml");
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  expect(await feed.text()).toContain("<rss version=\"2.0\"");
  expect((await request.get("/447a8b74f419cf147fea548adc78a6cb.txt")).status()).toBe(200);

  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "About" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How Baseline Today is built" })).toBeVisible();
});

test("upset map and model accuracy, linked from stats", async ({ page }) => {
  await page.goto("/stats");
  await page.getByRole("link", { name: "Upset map →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How often favorites lose" })).toBeVisible();
  for (const h of ["By round", "By surface", "By tour", "By season"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await page.getByRole("link", { name: "accuracy over time" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Model accuracy" })).toBeVisible();
  await expect(page.getByText("Model vs the ranking")).toBeVisible();
  await expect(page.getByRole("img", { name: /by season, ATP and WTA/ })).toBeVisible();
});

test("rivals page: record against every opponent, linked to head-to-heads", async ({ page }) => {
  await page.goto("/rankings/atp");
  await page.locator("tbody tr").first().getByRole("link").click();
  await page.getByRole("link", { name: "All rivals" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /against every opponent/ })).toBeVisible();
  await expect(page.getByText("vs today’s top 10", { exact: true })).toBeVisible();
  const first = page.locator("tbody tr").first().locator('a[href^="/h2h/"]');
  await expect(first).toBeVisible();
});

test("upcoming match pages explain the model's chance", async ({ page }) => {
  await page.goto("/odds");
  const preview = page.locator('a[href^="/matches/"]', { hasText: "Preview" }).first();
  test.skip((await preview.count()) === 0, "no upcoming matches right now");
  await preview.click();
  const why = page.getByRole("heading", { name: /^Why the model says \d+%–\d+%$/ });
  if ((await why.count()) > 0) {
    await expect(why).toBeVisible();
    await expect(page.getByText("From overall ratings")).toBeVisible();
  }
});

test("changelog, new widgets and on-this-day finals", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Changelog" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Changelog" })).toBeVisible();
  await expect(page.locator("main li").first()).toBeVisible();
  for (const path of ["/embed/upsets", "/embed/player/4", "/embed/h2h/jannik-sinner-vs-carlos-alcaraz-4-6"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
  }
  expect((await request.get("/embed/h2h/nope")).status()).toBe(404);
});

test("records and tournament history", async ({ page }) => {
  await page.goto("/stats");
  await page.getByRole("link", { name: "All-time records →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /records since 2015/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most titles", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Longest winning streaks" })).toBeVisible();
  await page.goto("/tournaments");
  await page.getByRole("link", { name: "Past winners since 2015" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tournament history" })).toBeVisible();
  await page.locator('main a[href^="/history/"]').first().click();
  await expect(page.getByRole("heading", { level: 1, name: /: past winners$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Every final" })).toBeVisible();
  expect((await page.request.get("/history/atp-nope-999999999")).status()).toBe(404);
});

test("season review from a player page", async ({ page }) => {
  await page.goto("/rankings/atp");
  await page.locator("tbody tr").first().getByRole("link").click();
  const nav = page.getByRole("navigation", { name: "Season reviews" });
  await nav.getByRole("link").nth(1).click();
  await expect(page.getByRole("heading", { level: 1, name: /’s \d{4} season$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Best wins" })).toBeVisible();
  expect((await page.request.get("/players/4/season/1999")).status()).toBe(404);
});

test("race: what it takes; betting calculator maths", async ({ page }) => {
  await page.goto("/race");
  await expect(page.getByRole("heading", { level: 1, name: /season race/ })).toBeVisible();
  await page.goto("/tools/betting");
  await expect(page.getByRole("heading", { level: 1, name: "Betting maths calculator" })).toBeVisible();
  await expect(page.getByText("Betting is for adults only")).toBeVisible();
  await page.getByLabel(/Player A: odds/).fill("1.90");
  await page.getByLabel(/Player B: odds/).fill("1.90");
  await expect(page.getByText("5.3%").first()).toBeVisible(); // margin of a 1.90/1.90 market
  await page.getByLabel("Leg 1 odds").fill("1.5");
  await page.getByLabel("Leg 2 odds").fill("2");
  await expect(page.getByText("3.00 · +200")).toBeVisible();
});

test("public JSON API", async ({ request }) => {
  const players = await (await request.get("/api/v1/players?q=sinner")).json();
  expect(players.license).toContain("CC BY-SA 4.0");
  expect(players.data[0]).toMatchObject({ id: expect.any(Number), name: expect.stringContaining("Sinner") });
  const h2h = await request.get("/api/v1/h2h?a=4&b=6");
  expect(h2h.headers()["access-control-allow-origin"]).toBe("*");
  const body = await h2h.json();
  expect(body.data.wins.a + body.data.wins.b).toBeGreaterThan(5);
  expect(body.data.modelChanceA.all).toBeGreaterThan(0);
  expect((await request.get("/api/v1/h2h?a=4")).status()).toBe(400);
  expect((await (await request.get("/api/v1/upsets?days=7")).json()).data).toBeInstanceOf(Array);

  // Research lab data.
  const ratings = await (await request.get("/api/v1/lab/ratings?player=4")).json();
  expect(ratings.data.weeks.length).toBeGreaterThan(50);
  const forecast = await (await request.get("/api/v1/lab/forecast?tour=wta")).json();
  expect(Object.keys(forecast.data.surfaces)).toEqual(expect.arrayContaining(["hard", "clay", "grass"]));
  expect((await request.get("/api/v1/lab/nope")).status()).toBe(404);
  const chances = await request.get("/data/title-chances-2024.csv");
  expect((await chances.text()).split("\r\n")[0]).toContain("title_chance");
});

test("daily puzzle: a wrong guess gets feedback, the answer stays on the server", async ({ page, request }) => {
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: /^Guess the player #\d+$/ })).toBeVisible();
  const meta = await (await request.get("/api/puzzle")).json();
  expect(meta).toMatchObject({ number: expect.any(Number), tour: expect.stringMatching(/^(atp|wta)$/) });
  expect(JSON.stringify(meta)).not.toContain("answer");
  // Guess someone from the right tour via the API, then check the page renders a row.
  const name = meta.tour === "atp" ? "zverev" : "gauff";
  const [player] = (await (await request.get(`/api/search?q=${name}`)).json()) as { id: number }[];
  const res = await request.post("/api/puzzle", { data: { day: meta.day, playerId: player.id } });
  const body = await res.json();
  expect(body.feedback).toHaveProperty("country");
  expect(body.answer === undefined).toBe(!body.feedback.correct);
  expect((await request.post("/api/puzzle", { data: { day: "2020-01-01", playerId: 1 } })).status()).toBe(400);
  await page.getByLabel(/^Guess 1 of 6$/).fill(name);
  await page.getByRole("button", { name: new RegExp(name, "i") }).first().click();
  await expect(page.getByRole("table", { name: /Your guesses/ })).toBeVisible();
});

test("research lab: luck, time machine, aging and the explorer", async ({ page, request }) => {
  test.setTimeout(180_000); // many pages in one walk
  await page.goto("/");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Research lab" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tennis, replayed" })).toBeVisible();
  await page.getByRole("link", { name: /Expected vs actual titles/ }).click();
  await expect(page.getByRole("heading", { name: "Most improbable champions" })).toBeVisible();
  await expect(page.locator("table").first().locator("tbody tr")).not.toHaveCount(0);

  await page.goto("/lab/time-machine");
  await expect(page.getByText(/chance to win/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "ATP peak ratings since 2015" })).toBeVisible();
  expect((await request.get("/api/lab/ratings/4")).status()).toBe(200);

  await page.goto("/lab/aging");
  await expect(page.getByRole("img", { name: /cumulative rating change by age/ })).toBeVisible();

  await page.goto("/lab/explorer?p=4&surface=Clay&stage=f");
  await expect(page.getByRole("heading", { level: 1, name: "Results explorer" })).toBeVisible();
  await expect(page.getByText("Model expected")).toBeVisible();
  const csv = await request.get("/lab/explorer/csv?p=4&surface=Clay");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).split("\r\n")[0]).toContain("model_chance");

  await page.goto("/lab/similar?p=4");
  await expect(page.getByRole("heading", { name: "Most similar" })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="sim-heading"] li')).toHaveCount(8);

  await page.goto("/lab/in-the-way");
  await expect(page.getByRole("heading", { name: "The biggest obstacles" })).toBeVisible();
  await page.locator('section[aria-labelledby="pairs-heading"] a').first().click();
  await expect(page.getByText("Titles they cost others")).toBeVisible();

  await page.goto("/lab/clutch?tour=wta");
  await expect(page.getByRole("heading", { name: "Tiebreaks: above expectation" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Deciding sets: above expectation" }).locator("tbody tr")).not.toHaveCount(0);

  await page.goto("/lab/dream-draw");
  const draw = page.getByRole("table", { name: "Chances to reach each round in this draw" });
  await expect(draw.locator("tbody tr")).toHaveCount(8, { timeout: 20_000 });
  await page.getByRole("button", { name: "ATP peaks · 16" }).click();
  await expect(draw.locator("tbody tr")).toHaveCount(16, { timeout: 20_000 });

  await page.goto("/lab/comparables?tour=wta");
  await expect(page.getByRole("heading", { level: 1, name: "Career comparables" })).toBeVisible();
  await expect(page.getByRole("table", { name: /closest to/ }).locator("tbody tr")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Does it work? The backtest" })).toBeVisible();

  await page.goto("/lab/season");
  await expect(page.getByRole("heading", { level: 1, name: "Season simulator" })).toBeVisible();
  await expect(page.getByRole("table", { name: /season simulator/ }).locator("tbody tr")).not.toHaveCount(0);

  await page.goto("/lab/factors");
  await expect(page.getByRole("heading", { level: 1, name: "What decides matches" })).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(7);

  await page.goto("/lab/comebacks?tour=wta");
  await expect(page.getByRole("heading", { level: 1, name: "Comeback curves" })).toBeVisible();
  await expect(page.getByRole("table", { name: /strongest returns/ }).locator("tbody tr")).not.toHaveCount(0);

  await page.goto("/lab/scorelines");
  await expect(page.getByRole("heading", { level: 1, name: "Scoreline probabilities" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Straight-sets win/ })).toBeVisible();

  // A finished draw that keeps its bracket: the 2023 US Open (men).
  await page.goto("/tournaments/1101/draw-report");
  await expect(page.getByRole("heading", { level: 1, name: /the draw, analysed/ })).toBeVisible();
  await expect(page.getByRole("table", { name: /average draw/ }).locator("tbody tr")).toHaveCount(16);

  await page.goto("/lab/fragility?tour=wta");
  await expect(page.getByRole("heading", { name: "The verdict: a myth" })).toBeVisible();
  await expect(page.getByRole("table", { name: /most often/ }).locator("tbody tr")).toHaveCount(10);

  await page.goto("/rankings/rebuilt?tour=atp&date=2023-01-02");
  await expect(page.getByRole("heading", { level: 1, name: "Rankings on any date" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Rebuilt ranking" }).locator("tbody tr")).toHaveCount(50);
  await page.getByLabel("Without").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("columnheader", { name: "Change" })).toBeVisible();

  await page.goto("/lab/turnarounds");
  await expect(page.getByRole("heading", { level: 1, name: "Greatest turnarounds" })).toBeVisible();
  await expect(page.getByRole("table", { name: /lowest win chance/ }).locator("tbody tr")).toHaveCount(20);

  await page.goto("/lab/pace");
  await expect(page.getByRole("heading", { level: 1, name: "Court pace from scorelines" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Fastest ATP events lately" }).locator("tbody tr")).not.toHaveCount(0);

  await page.goto("/lab/traits");
  await expect(page.getByRole("heading", { level: 1, name: "Lefties, one-handers and height" })).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(7);

  await page.goto("/lab/draw-audit");
  await expect(page.getByRole("heading", { level: 1, name: "Are the draws fair?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The verdict" })).toBeVisible();

  await page.goto("/lab/deserved");
  await expect(page.getByRole("heading", { level: 1, name: "The deserved record" })).toBeVisible();
  await expect(page.getByRole("table", { name: /most wins above/ }).locator("tbody tr")).toHaveCount(10);

  await page.goto("/lab/conditions");
  await expect(page.getByRole("heading", { level: 1, name: "Heat, altitude and jet lag" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Heat and upsets" })).toBeVisible();

  await page.goto("/lab/momentum");
  await expect(page.getByRole("heading", { level: 1, name: "Does momentum exist?" })).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(3);

  await page.goto("/lab/forecast?tour=wta&surface=clay");
  await expect(page.getByRole("heading", { level: 1, name: "If a Grand Slam started today" })).toBeVisible();
  await expect(page.getByRole("table", { name: /clay Grand Slam starting today, WTA/ }).locator("tbody tr")).toHaveCount(20);

  await page.goto("/lab/greatest");
  await expect(page.locator("main ol li")).toHaveCount(50);
  await page.getByRole("navigation", { name: "Season" }).getByRole("link", { name: "2024" }).click();
  await expect(page.locator("main ol li")).toHaveCount(10);

  await page.goto("/lab/form?days=90");
  await expect(page.getByRole("table", { name: "Hot: winning more than expected" }).locator("tbody tr")).not.toHaveCount(0);

  // Player pages chart ratings overall or per surface, for every player.
  await page.goto("/players/4");
  await page.getByRole("group", { name: "Surface" }).getByRole("button", { name: "Clay" }).click();
  await expect(page.getByRole("group", { name: "Surface" }).getByRole("button", { name: "Clay" })).toHaveAttribute("aria-pressed", "true");
});
