import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

test('cold start fits the budget', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('btn-new')).toBeVisible();
  const menu = Date.now() - t0;
  const t1 = Date.now();
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-medium').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  const world = Date.now() - t1;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/startup-${test.info().project.name}.json`, JSON.stringify({ menuMs: menu, mediumWorldMs: world }));
  expect(menu).toBeLessThan(5000);
  expect(world).toBeLessThan(20000);
});
