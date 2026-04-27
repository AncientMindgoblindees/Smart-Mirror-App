import { expect, test } from '@playwright/test';


test('companion app loads the core control sections', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Wardrobe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pose Capture' })).toBeVisible();
});
