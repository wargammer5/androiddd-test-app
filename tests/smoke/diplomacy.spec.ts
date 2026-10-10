import { test, expect } from '@playwright/test';

test('diplomacy window opens with all tabs', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('btn-diplomacy').click();
  const panel = page.getByTestId('diplomacy-panel');
  await expect(panel).toBeVisible();
  for (const b of await panel.locator('.row button').all()) await b.click();
  expect(errs).toEqual([]);
});
