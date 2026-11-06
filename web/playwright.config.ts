// Browser tests for the workspace loop against the fake backend (DESIGN.md → Testing). Run: npx playwright test
import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  workers: 1, // one fake server, one chat: tests take turns
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? "github" : "list",
  // localhost, not 127.0.0.1: next dev refuses its dev assets to other origins, so the page never hydrates.
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  // Every flow on desktop; flow 1 again at phone size, as tests tagged @phone (DESIGN.md → Testing → Flows covered).
  // Chromium with touch, not an iPhone preset: those run WebKit, and CI installs Chromium only.
  projects: [
    { name: "desktop", grepInvert: /@phone/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", grep: /@phone/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    // Always its own fake: a real API already on :8000 fails the run ("port already used") instead of sending turns to Ollama.
    { command: "uv run python -m tests.e2e_server", cwd: "..", port: 8000, reuseExistingServer: false },
    // CI builds in its own step, then serves the build; locally `next dev` (DESIGN.md → Testing → Which build).
    { command: CI ? "npm run start" : "npm run dev", port: 3000, reuseExistingServer: !CI, timeout: 120_000 },
  ],
});
