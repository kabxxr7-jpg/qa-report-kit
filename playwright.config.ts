import { defineConfig } from "@playwright/test";

// BUILD=buggy serves app-buggy/ (the build with planted bugs) instead of app/.
// QA_PORT picks the port (the mutation check runs several copies at once).
// QA_CHROME_PATH points at a Chrome binary; by default the installed Google Chrome is used (channel "chrome").
const build = process.env.BUILD === "buggy" ? "app-buggy" : "app";
const port = Number(process.env.QA_PORT ?? 4173);
const chromePath = process.env.QA_CHROME_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: Number(process.env.QA_WORKERS ?? 4),
  retries: 0, // no retries: a flaky test must show up as a failure, not be hidden
  timeout: 20_000,
  expect: { timeout: 5_000 },
  outputDir: `test-results/${build}`,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    ...(chromePath ? { launchOptions: { executablePath: chromePath } } : { channel: "chrome" }),
    viewport: { width: 1440, height: 900 },
    locale: "en-GB",
    timezoneId: "Europe/London",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node ${build}/server.mjs`,
    url: `http://127.0.0.1:${port}/health`,
    env: { PORT: String(port), BAKERY_TODAY: "2026-11-04" },
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
