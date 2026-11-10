// Captures the README screenshots and the demo video (turned into a GIF with ffmpeg):
// `pnpm screenshots` at the repo root. Same servers as the E2E tests, output in docs/media.
import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './capture',
  retries: 0,
  reporter: 'list',
  outputDir: './capture-results',
  projects: [
    {
      name: 'desktop',
      grep: /screenshots/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'gif',
      grep: /demo video/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1100, height: 700 },
        video: { mode: 'on', size: { width: 1100, height: 700 } },
      },
    },
  ],
});
