import { expect, test, type Page } from '@playwright/test';

const OUT = '../docs/media';

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page).toHaveURL(/\/trips$/);
}

async function shoot(page: Page, path: string, name: string, wait: () => Promise<void>) {
  await page.goto(path);
  await wait();
  const map = page.locator('[data-map-idle]');
  if (path.startsWith('/trips/demo')) {
    await page.locator('.maplibregl-canvas').waitFor({ timeout: 30_000 });
    await map.waitFor({ timeout: 45_000 });
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('desktop screenshots in English and Arabic', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/home.png` });
  await startDemo(page);
  const day = () => expect(page.getByRole('region', { name: /Day 1|اليوم 1/ })).toBeVisible();
  const heading = () => expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, '/trips', 'trips', heading);
  await shoot(page, '/trips/demo-lisbon', 'itinerary', day);
  await shoot(page, '/trips/demo-lisbon/budget', 'budget', heading);
  await shoot(page, '/trips/demo-lisbon/packing', 'packing', heading);
  await shoot(page, '/trips/demo-lisbon/documents', 'documents', heading);
  await shoot(page, '/pricing', 'pricing', heading);
  await page.getByRole('button', { name: 'Switch to Arabic' }).click();
  await shoot(page, '/trips/demo-copenhagen', 'itinerary-ar', day);
});

test('demo video: wizard, itinerary on the map, make it more relaxed', async ({ page }) => {
  const pause = (ms = 700) => page.waitForTimeout(ms);
  await startDemo(page);
  await pause();
  await page.getByRole('link', { name: 'Plan a new trip' }).click();
  await page.getByLabel('Destination').pressSequentially('Lisbon', { delay: 60 });
  await page.getByRole('button', { name: 'Search' }).click();
  await pause();
  await page.getByRole('button', { name: /Lisbon, Portugal/ }).click();
  await pause();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Number of days', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Number of days' }).fill('2');
  await pause(400);
  // Dates, travellers and budget keep their defaults.
  for (const _ of [1, 2, 3]) {
    await page.getByRole('button', { name: 'Next' }).click();
    await pause(400);
  }
  await page.getByText('Food', { exact: true }).click();
  await page.getByText('History', { exact: true }).click();
  await pause(400);
  for (const _ of [1, 2, 3]) {
    await page.getByRole('button', { name: 'Next' }).click();
    await pause(400);
  }
  await pause();
  await page.getByRole('button', { name: 'Build my plan' }).click();
  const dayOne = page.getByRole('region', { name: /Day 1/ });
  await expect(dayOne).toBeVisible({ timeout: 30_000 });
  await pause(2500);
  await page.getByLabel('Ask the AI to change day 1').selectOption('relaxed');
  const dialog = page.getByRole('dialog', { name: /Make it more relaxed/ });
  await expect(dialog).toBeVisible();
  await pause(2200);
  await dialog.getByRole('button', { name: 'Apply changes' }).click();
  await pause(2500);
});
