import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/sandbox",
  testDir: "./tests/sandbox",
  timeout: 90000,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5180",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: { timeout: 15000 },
  webServer: {
    command: "npm run dev:sandbox:legacy -- --temporary",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
