import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/pwa",
  testDir: "./tests/pwa",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "tsx tests/e2e-server.ts",
    env: { TEST_APP_ORIGIN: "http://127.0.0.1:4173", TEST_APP_PORT: "4173" },
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
