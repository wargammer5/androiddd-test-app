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
  await page.getByTestId('speed-0').click();
  const c = await page.evaluate(async () => {
    const s = (window as unknown as { __sotv: { query: (q: unknown) => Promise<unknown>; centerOn: (x: number, y: number, z: number) => void } }).__sotv;
    const lists = (await s.query({ kind: 'lists' })) as { cities: { id: number }[] };
    const first = lists.cities[0];
    if (!first) return null;
    const c = (await s.query({ kind: 'city', id: first.id })) as { x: number; y: number } | null;
    if (c) s.centerOn(c.x + 0.5, c.y + 0.5, 14);
    return c;
  });
  expect(c).not.toBeNull();
  let opened = false;
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, -3], [1, 1], [-1, 2]] as const) {
    await page.evaluate(([x, y]) => (window as unknown as { __sotv: { inspect: { set: (v: unknown) => void } } }).__sotv.inspect.set({ x, y, at: performance.now() }), [c!.x + dx, c!.y + dy]);
    if (await page.getByTestId('open-city').isVisible({ timeout: 1500 }).catch(() => false)) {
      opened = true;
      break;
    }
    await page.waitForTimeout(1500);
    if (await page.getByTestId('open-city').isVisible()) {
      opened = true;
      break;
    }
  }
  expect(opened).toBe(true);
  await page.getByTestId('open-city').click();
  await expect(page.getByTestId('city-panel')).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `test-results/city-${test.info().project.name}.png` });
  expect(errs).toEqual([]);
});
