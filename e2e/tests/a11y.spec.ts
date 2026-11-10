import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { startDemo } from './helpers';

// WCAG 2.2 A and AA rules on the main pages, in English and Arabic (right to left).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // The map's canvas and third-party controls are covered by the list view next to it.
    .exclude('.maplibregl-canvas-container')
    .exclude('.maplibregl-ctrl')
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary, label).toEqual([]);
}

test('the landing page has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  await expectNoViolations(page, '/');
});

for (const language of ['en', 'ar'] as const) {
  test(`signed-in pages have no accessibility violations (${language})`, async ({ page }) => {
    test.setTimeout(180_000); // nine pages, each fully analysed
    await startDemo(page);
    if (language === 'ar') {
      await page.getByRole('button', { name: 'Switch to Arabic' }).click();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    }
    const trip = '/trips/demo-lisbon';
    for (const path of [
      '/trips',
      '/trips/new',
      trip,
      `${trip}/budget`,
      `${trip}/packing`,
      `${trip}/documents`,
      `${trip}/weather`,
      '/pricing',
      '/settings',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByRole('status').filter({ hasText: /^(Loading|جارٍ التحميل)$/ }),
      ).toHaveCount(0);
      await expectNoViolations(page, `${path} (${language})`);
    }
  });
}
