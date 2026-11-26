import { defineConfig, devices } from "@playwright/test";
const apiPort=Number(process.env.TEST_API_PORT||3001),webPort=Number(process.env.TEST_WEB_PORT||5173);
const webOrigin=`http://127.0.0.1:${webPort}`,apiOrigin=`http://127.0.0.1:${apiPort}`;
export default defineConfig({
  outputDir: "test-results/browser",
  testDir: "./tests/browser",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: webOrigin,
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "tsx tests/e2e-server.ts",
      env: {TEST_APP_PORT:String(apiPort),TEST_APP_ORIGIN:webOrigin},
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      env: {BITPOLITO_API_PROXY:apiOrigin,VITE_HUB_PREVIEW:"false"},
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
