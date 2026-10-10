import { test, expect, type Page } from '@playwright/test';

async function insideViewport(page: Page): Promise<void> {
  const pop = page.locator('.layers-pop').first();
  await expect(pop).toBeVisible();
  const box = (await pop.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  const bar = await page.locator('.toolbar').boundingBox();
  if (bar) expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
}

test('windows and layers popups stay on screen', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  const win = page.getByTestId('btn-windows');
  if (await win.isVisible()) {
    await win.click();
    await insideViewport(page);
    await win.click();
  }
  await page.getByTestId('btn-layers').click();
  await insideViewport(page);
});

test('popups stay on screen when the top bar wraps on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  const win = page.getByTestId('btn-windows');
  await win.click();
  await insideViewport(page);
  await win.click();
  await page.getByTestId('btn-layers').click();
  await insideViewport(page);
  await page.screenshot({ path: `test-results/popup-narrow-${test.info().project.name}.png` });
});
