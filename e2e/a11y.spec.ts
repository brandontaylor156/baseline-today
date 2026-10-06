import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated accessibility check (axe, WCAG 2.2 A and AA) of the main pages, in light and dark mode.
const PAGES = ["/", "/rankings/atp", "/results", "/tournaments", "/odds", "/pickem", "/leagues", "/party/demo", "/status", "/search?q=sinner", "/h2h", "/stats", "/privacy", "/week", "/data", "/about", "/upsets", "/model", "/changelog", "/records", "/history", "/tools/betting", "/players/4/rivals", "/players/4/season/2025", "/history/atp-australian-open-225", "/play", "/lab", "/lab/luck", "/lab/time-machine", "/lab/aging", "/lab/explorer?p=4", "/lab/similar?p=4", "/lab/in-the-way", "/lab/in-the-way?p=4", "/lab/clutch", "/lab/dream-draw", "/lab/forecast", "/lab/form", "/lab/greatest", "/lab/comparables", "/lab/season", "/lab/factors", "/lab/comebacks", "/lab/scorelines", "/tournaments/1101/draw-report", "/h2h/jannik-sinner-vs-carlos-alcaraz-4-6"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    // Scanning long tables (the explorer, rivals) takes axe a while.
    test.describe.configure({ timeout: 90_000 });
    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× ${v.nodes[0]?.target.join(" ")} – ${v.help}`);
        expect(summary).toEqual([]);
      });
    }
  });
}

test("a player page passes axe", async ({ page }) => {
  await page.goto("/rankings/atp");
  await page.locator('a[href^="/players/"]').first().click();
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
});
