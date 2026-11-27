import { defineConfig } from "@playwright/test";

// End-to-end UX checks against the browser simulator. No application server is involved.
export default defineConfig({
  testDir: "./tests/hub",
  outputDir: "test-results/hub",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:5190",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "VITE_HUB_PREVIEW=true vite --host 127.0.0.1 --port 5190 --strictPort",
    url: "http://127.0.0.1:5190",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
