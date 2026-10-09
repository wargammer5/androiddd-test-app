import { test, expect, type Page } from '@playwright/test';

async function startWorld(page: Page, size = 'small') {
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await page.getByTestId('size-' + size).click();
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 60000 });
}

test('terrain brush, undo, save and load', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await startWorld(page);
  await expect(page.getByTestId('minimap')).toBeVisible();
  await page.getByTestId('power-raise').click();
  const canvas = page.getByTestId('world-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.getByTestId('btn-undo').click();
  await page.getByTestId('tool-hand').click();
  await page.mouse.click(cx, cy);
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('save-slot-1').click();
  await expect(page.getByTestId('save-msg')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('load-slot-1').click();
  await expect(page.getByTestId('hud-stats')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/world-${test.info().project.name}.png` });
  expect(errs).toEqual([]);
});

test('corrupted save shows an error instead of crashing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const req = indexedDB.open('sotvorenie', 1);
    await new Promise<void>((res) => {
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res();
    });
    const db = req.result;
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(new Uint8Array([83, 79, 84, 86, 1, 0, 0, 0, 1, 2, 3, 4, 9, 9, 9]), 'save:auto');
    tx.objectStore('kv').put(new TextEncoder().encode(JSON.stringify({ key: 'save:auto', seed: 'x', size: 'small', year: 0, population: 0, savedAt: 1, bytes: 15 })), 'meta:save:auto');
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.reload();
  await page.getByTestId('btn-continue').click();
  await expect(page.getByTestId('load-error')).toBeVisible({ timeout: 15000 });
});
