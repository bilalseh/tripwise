import { expect, test } from '@playwright/test';

import { startDemo } from './helpers';

// The main flow: demo sign-in, wizard, AI itinerary on the map, "make it more relaxed".
test('plan a trip end to end and relax a day', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('link', { name: 'Plan a new trip' }).click();

  await page.getByLabel('Destination').fill('Lisbon');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: /Lisbon, Portugal/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByText('Number of days', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Number of days' }).fill('2');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click(); // couple
  await page.getByRole('button', { name: 'Next' }).click(); // budget
  await page.getByText('Food', { exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click(); // pace
  await page.getByRole('button', { name: 'Next' }).click(); // needs
  await page.getByRole('button', { name: 'Build my plan' }).click();

  // Generation, then the grounded itinerary.
  const dayOne = page.getByRole('region', { name: /Day 1/ });
  await expect(dayOne).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('note').filter({ hasText: 'could not be found on OpenStreetMap' }),
  ).toContainText('Invented Garden of Wonders 1');
  const before = await dayOne.getByRole('heading', { level: 3 }).count();
  expect(before).toBeGreaterThan(1);

  // Ask the AI, review the diff, apply, then undo.
  await page.getByLabel('Ask the AI to change day 1').selectOption('relaxed');
  const dialog = page.getByRole('dialog', { name: /Make it more relaxed: day 1/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Fewer stops and longer visits', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply changes' }).click();
  await expect(dayOne.getByRole('heading', { level: 3 })).toHaveCount(Math.min(before, 2));
  await expect(page.getByText('All changes saved')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(dayOne.getByRole('heading', { level: 3 })).toHaveCount(before);
});

test('edits survive a reload', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('link', { name: /Lisbon city break/ }).click();
  const dayOne = page.getByRole('region', { name: /Day 1/ });
  await expect(dayOne).toBeVisible();

  await dayOne.getByRole('button', { name: 'Remove LX Factory' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.reload();

  await expect(
    page.getByRole('region', { name: /Day 1/ }).getByRole('heading', { name: 'LX Factory' }),
  ).toHaveCount(0);
});
