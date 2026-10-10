import { test, expect } from '@playwright/test';
import { openWindow } from './helpers.ts';

test('statistics, chronicle, event feed, layers and timelapse', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('speed-8').click();
  await expect(page.getByTestId('event-feed')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(4000);
  await openWindow(page, 'stats');
  await expect(page.getByTestId('stats-panel')).toBeVisible();
  for (const tab of ['kingdoms', 'species', 'faiths', 'world']) await page.getByTestId('stats-' + tab).click();
  await openWindow(page, 'chronicle');
  await expect(page.getByTestId('chronicle-panel')).toBeVisible();
  await openWindow(page, 'chronicle');
  for (const l of [6, 7, 8]) {
    await page.getByTestId('btn-layers').click();
    await page.getByTestId('layer-' + l).click();
    await page.waitForTimeout(300);
  }
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('btn-tl-start').click();
  await page.waitForTimeout(2000);
  await page.getByTestId('btn-tl-stop').click();
  await page.screenshot({ path: `test-results/interface-${test.info().project.name}.png` });
  expect(errs).toEqual([]);
});
