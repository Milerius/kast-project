import { test, expect } from '@playwright/test';

test('app boots and renders login screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /yield curator/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /connect with privy/i })).toBeVisible();
});
