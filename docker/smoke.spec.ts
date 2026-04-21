import { test, expect } from '@playwright/test';

test('app boots and renders Log in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'KAST DeFi' })).toBeVisible();
  await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
});
