import { expect, test } from '@playwright/test';


test('companion app loads the core control sections', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Mirror Screen' })).toBeVisible();

  await page.getByRole('button', { name: 'Wardrobe' }).click();
  await expect(page.getByRole('heading', { name: 'Wardrobe' })).toBeVisible();

  await page.getByRole('button', { name: 'Connection' }).click();
  await expect(page.getByRole('heading', { name: 'Connection Diagnostics' })).toBeVisible();
});
