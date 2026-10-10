import { test, expect } from '@playwright/test';

test('cities appear and the city window opens', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.addInitScript(() => localStorage.setItem('sotv.settings', JSON.stringify({ quality: 'high' })));
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('speed-8').click();
  await expect(page.getByTestId('hud-cities')).not.toHaveText(/🏰 0/, { timeout: 60000 });
  const ok = await page.evaluate(async () => {
    const s = (window as unknown as { __sotv: { query: (q: unknown) => Promise<unknown>; inspect: { set: (v: unknown) => void }; centerOn: (x: number, y: number, z: number) => void } }).__sotv;
    const c = (await s.query({ kind: 'city', id: 0 })) as { x: number; y: number } | null;
    if (!c) return false;
    s.centerOn(c.x + 0.5, c.y + 0.5, 14);
    s.inspect.set({ x: c.x + 2, y: c.y, at: performance.now() });
    return true;
  });
  expect(ok).toBe(true);
  await page.getByTestId('open-city').click();
  await expect(page.getByTestId('city-panel')).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `test-results/city-${test.info().project.name}.png` });
  expect(errs).toEqual([]);
});
