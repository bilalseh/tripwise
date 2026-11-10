// Runs the real web app and API together. From the repo root: `pnpm test:e2e`.
// Later phases wrap this in `firebase emulators:exec` once flows need Auth and Firestore.
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: isCI ? 1 : 0,
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
      command:
        'uv run --directory ../api uvicorn tripwise_api.main:create_app --factory --port 8000',
      url: 'http://127.0.0.1:8000/api/health',
      env: {
        ...process.env,
        FIREBASE_PROJECT_ID: 'demo-tripwise',
        ENVIRONMENT: 'local',
        APP_VERSION: 'e2e',
      },
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @tripwise/web exec vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
