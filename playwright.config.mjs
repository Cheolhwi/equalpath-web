import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  outputDir: ".build/browser-results",
  reporter: [
    ["list"],
    ["json", { outputFile: `${process.env.QA_EVIDENCE_DIR || "evidence/phase4-5"}/browser-results.json` }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4191",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    launchOptions: process.env.PW_CHANNEL
      ? { channel: process.env.PW_CHANNEL }
      : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "VITE_EQUALPATH_API_URL=/api npm run dev -- --port 4191",
    url: "http://127.0.0.1:4191",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
