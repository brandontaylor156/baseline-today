import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Browser tests against a production build (`npm run build` first), reading the live
// public data through the publishable key. They never sign in or write anything.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // One local `next start` process serves every test; more workers only measure contention.
  workers: 2,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
