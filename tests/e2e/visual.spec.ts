import { test, expect } from '@playwright/test';

/**
 * Visual regression tests: capture screenshots and compare to baseline.
 * Update baselines after intentional UI changes: npx playwright test --update-snapshots
 */
test.describe('Visual regression', () => {
  test('home page matches snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('home.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});
