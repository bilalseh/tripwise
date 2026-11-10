import { expect, test } from '@playwright/test';

import { startDemo } from './helpers';

test('a share link opens read-only without signing in, and can be revoked', async ({
  page,
  browser,
}) => {
  await startDemo(page);
  await page.getByRole('link', { name: /Lisbon city break/ }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Create link' }).click();
  const url = await page.getByLabel('Read-only link').inputValue();

  const visitor = await browser.newContext();
  const shared = await visitor.newPage();
  await shared.goto(url);
  await expect(shared.getByText('Shared trip, read only')).toBeVisible();
  await expect(shared.getByRole('heading', { name: 'Lisbon city break' })).toBeVisible();
  await expect(shared.getByRole('button', { name: /Remove/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Turn off link' }).click();
  await expect(page.getByRole('button', { name: 'Create link' })).toBeVisible();
  await shared.reload();
  await expect(shared.getByText('This link no longer works')).toBeVisible();
  await visitor.close();
});

test('budget, packing, documents and weather tabs work', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('link', { name: /Lisbon city break/ }).click();

  await page.getByRole('link', { name: 'Budget' }).click();
  await expect(
    page.getByRole('meter', { name: 'Estimated total against your budget' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Packing' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'packed' })).toBeVisible();
  await page.getByLabel('Add an item').fill('Camera');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Camera')).toBeVisible();

  await page.getByRole('link', { name: 'Documents' }).click();
  await expect(page.getByRole('link', { name: /GOV.UK foreign travel advice/ })).toHaveAttribute(
    'href',
    'https://www.gov.uk/foreign-travel-advice',
  );

  await page.getByRole('link', { name: 'Weather' }).click();
  await expect(page.getByText(/Daily forecast for your dates/)).toBeVisible();
});
