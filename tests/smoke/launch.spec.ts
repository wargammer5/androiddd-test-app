import { test, expect, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  return errs;
}

test('main menu shows version and world starts', async ({ page }) => {
  const errs = collectErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('version')).toContainText('v');
  await page.getByTestId('btn-about').click();
  await expect(page.getByTestId('about-version')).toBeVisible();
  await page.goBack().catch(() => undefined);
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const tick = await page.getByTestId('hud-stats').innerText();
  expect(tick.length).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/smoke-${test.info().project.name}.png` });
  expect(errs).toEqual([]);
});
