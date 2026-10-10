import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build using the separate test database.
const DATABASE_URL = process.env.E2E_DATABASE_URL || "postgres://sevgio:sevgio@localhost:5432/sevgio_test";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}) },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL, SITE_URL: `http://localhost:${PORT}`, CRON_SECRET: "e2e-secret", NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_test_e2e_dummy", STRIPE_WEBHOOK_SECRET: "whsec_e2e_test", REQUIRE_EMAIL_VERIFICATION: "always", TICKETMASTER_API_KEY: "e2e-key", TICKETMASTER_BASE: "http://localhost:3199", BACKGROUND_JOBS: "off", GEOCODE: "off" },
  },
});
