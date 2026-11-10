// Runs the real web app and API against the Firebase emulators, with the deterministic fake AI
// and places providers. From the repo root: `pnpm test:e2e` (wraps this in emulators:exec).
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: isCI ? 1 : 0,
  // Every test signs in a new demo account; two at a time keeps the emulators responsive.
  workers: 2,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST come from `emulators:exec`.
      command:
        'uv run --directory ../api uvicorn tripwise_api.main:create_app --factory --port 8000',
      url: 'http://127.0.0.1:8000/api/health',
      env: {
        ...process.env,
        FIREBASE_PROJECT_ID: 'demo-tripwise',
        ENVIRONMENT: 'local',
        APP_VERSION: 'e2e',
        AI_PROVIDERS: 'fake',
        PLACES_PROVIDER: 'fake',
        RATE_LIMIT_PER_MINUTE: '1000',
        SEARCH_LIMIT_PER_MINUTE: '1000',
      },
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      // web/.env.development points the app at the emulators.
      command: 'pnpm --filter @tripwise/web exec vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
