import { test, expect } from '@playwright/test';

test('cultures and religions window, editor and layers', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('speed-8').click();
  await expect(page.getByTestId('hud-cities')).not.toHaveText(/🏰 0/, { timeout: 60000 });
  await page.getByTestId('btn-beliefs').click();
  await expect(page.getByTestId('beliefs-panel')).toBeVisible();
  await page.locator('.list-row').first().click({ timeout: 15000 });
  await expect(page.getByTestId('belief-editor')).toBeVisible();
  await page.getByTestId('belief-save').click();
  await page.getByTestId('btn-layers').click();
  await page.getByTestId('layer-2').click();
  await page.waitForTimeout(800);
  await page.getByTestId('btn-layers').click();
  await page.getByTestId('layer-3').click();
  await page.waitForTimeout(800);
  expect(errs).toEqual([]);
});
