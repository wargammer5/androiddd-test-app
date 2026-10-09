import { test, expect } from '@playwright/test';

test('creatures spawn, render and show a card', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('tab-civ').click();
  await expect(page.getByTestId('power-spawn_velen')).toBeVisible();
  const found = await page.evaluate(async () => {
    const s = (window as unknown as { __sotv: { query: (q: unknown) => Promise<unknown>; inspect: { set: (v: unknown) => void }; centerOn: (x: number, y: number, z: number) => void } }).__sotv;
    for (let y = 20; y < 236; y += 6)
      for (let x = 20; x < 236; x += 6) {
        const u = (await s.query({ kind: 'unitAt', x, y, r: 6 })) as { id: number } | null;
        if (u) {
          const card = (await s.query({ kind: 'unit', id: u.id })) as { x: number; y: number };
          s.centerOn(card.x, card.y, 16);
          s.inspect.set({ x: Math.floor(card.x), y: Math.floor(card.y), at: performance.now() });
          return true;
        }
      }
    return false;
  });
  expect(found).toBe(true);
  await expect(page.getByTestId('unit-card')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('btn-follow').click();
  await page.getByTestId('speed-4').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `test-results/creatures-${test.info().project.name}.png` });
  expect(errs).toEqual([]);
});
