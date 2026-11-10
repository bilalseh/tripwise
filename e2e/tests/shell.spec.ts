import { expect, test } from '@playwright/test';

test('landing page loads and reaches the API through /api', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan a trip in minutes');
  await expect(page.getByRole('status')).toHaveText('API online (version e2e)');
});

test('language switch flips the layout to right-to-left', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Switch to Arabic' }).click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('خطّط لرحلتك في دقائق');
});

test('unknown paths show the not-found page', async ({ page }) => {
  await page.goto('/somewhere/else');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
