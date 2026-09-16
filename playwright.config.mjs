import { defineConfig } from "@playwright/test";
const port = process.env.PW_PORT || "4191";
const baseURL = `http://127.0.0.1:${port}`;
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
    baseURL,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    // The full browser uses modern headless mode. The legacy headless shell
    // forces software WebGL and stalls on the actual landing scene.
    channel: process.env.PW_CHANNEL || "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `VITE_EQUALPATH_API_URL=/api npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
