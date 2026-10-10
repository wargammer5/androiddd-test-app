import { test, expect } from '@playwright/test';

type A = { __sotvAudio: { loadedFiles: number; hasFiles: (n: string) => boolean; musicTrack: string | null } };

test('menu background animates, sound files and music tracks load', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/');
  const bg = page.getByTestId('menu-bg');
  await expect(bg).toBeVisible();
  const snap = () => bg.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const a = await snap();
  await page.waitForTimeout(800);
  expect(await snap()).not.toEqual(a);
  await page.getByTestId('btn-new').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as A).__sotvAudio.loadedFiles), { timeout: 30000 }).toBeGreaterThan(100);
  for (const n of ['click', 'explosion', 'thunder', 'splash', 'growl', 'ui_open', 'jingle_good']) expect(await page.evaluate((x) => (window as unknown as A).__sotvAudio.hasFiles(x), n)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as A).__sotvAudio.musicTrack), { timeout: 15000 }).toMatch(/music\/menu_/);
  await page.getByTestId('size-small').click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as A).__sotvAudio.musicTrack), { timeout: 20000 }).toMatch(/music\/(calm|night)_/);
  expect(errs).toEqual([]);
});
