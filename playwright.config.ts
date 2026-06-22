import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, ".env.test") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
