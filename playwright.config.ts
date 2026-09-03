import { defineConfig, devices } from '@playwright/test'

/**
 * ⚠️ THE POINT OF THIS FILE, IN ONE SENTENCE: every bug this project shipped in
 * the last week was invisible to the 84 test files, because they read SOURCE
 * TEXT and the bugs were in the rendered page.
 *
 * Measured, 2026-09-01 to 09-02 — none of these could be caught by a regex over
 * a component:
 *   · one URL served two different screens depending on how you arrived
 *   · the phone tab bar sat on top of every message composer, because a path
 *     regex had been stale for months and a test pinned the stale version
 *   · a signed-in client had no link anywhere to their own messages
 *   · the visibility switch rendered ON while the account was switched OFF
 *   · „მიმოწერა" landed on a list instead of the conversation
 *
 * So this config exists to run ONE walk of the commercial model against a real
 * browser and a real database. It is deliberately not a suite: a slow suite
 * nobody runs is worth less than one test everybody trusts.
 *
 * ⚠️ IT NEVER TOUCHES PRODUCTION. `webServer` starts `next dev` with an
 * explicitly local DATABASE_URL, and prisma/seed-e2e refuses any other host.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://mcodne:grubela22@localhost:5432/mcodne'

export default defineConfig({
  testDir: './e2e',
  // One worker: the walk writes a request and answers it, and two of them
  // racing over the same seeded provider would fight over `offerCount`.
  workers: 1,
  fullyParallel: false,
  // A flaky e2e test is worse than none — it teaches people to re-run rather
  // than to read. Retry once locally to absorb a cold compile, never in CI,
  // where a retry would hide exactly the flake we want reported.
  retries: process.env.CI ? 0 : 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // On failure, keep what a person would need to understand it without
    // re-running: the DOM, the network, the screenshot.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'ka-GE',
    timezoneId: 'Asia/Tbilisi',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // ⚠️ `next dev`, NOT `next build && start`. The point is to catch what a
    // developer sees; a production build would also cost two minutes per run
    // and this has to be cheap enough to run before every deploy.
    command: 'npx next dev -p ' + PORT,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DATABASE_URL: DB, NODE_ENV: 'development' },
  },
})
