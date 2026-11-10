import { expect, type Page } from '@playwright/test';

/** Signs in through "Try the demo" and waits for the seeded trips. */
export async function startDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  // The first visit compiles the app's chunks in the dev server, which can take a while.
  await expect(page).toHaveURL(/\/trips$/, { timeout: 30_000 });
  await expect(page.getByRole('link', { name: /Lisbon city break/ })).toBeVisible({
    timeout: 30_000,
  });
}
