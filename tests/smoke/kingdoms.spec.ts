import { openWindow } from './helpers.ts';
import { test, expect } from '@playwright/test';

test('kingdom list and realm window', async ({ page }) => {
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
  await openWindow(page, 'kingdoms');
  await expect(page.getByTestId('kingdom-list')).toBeVisible();
  await page.locator('.list-row').first().click({ timeout: 15000 });
  await expect(page.getByTestId('kingdom-panel')).toBeVisible();
  await page.getByTestId('btn-layers').click();
  await page.getByTestId('layer-1').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `test-results/kingdoms-${test.info().project.name}.png` });
  expect(errs).toEqual([]);
});
