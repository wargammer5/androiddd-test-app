import type { Page } from '@playwright/test';

export async function openWindow(page: Page, id: string): Promise<void> {
  const direct = page.getByTestId('btn-' + id);
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  await page.getByTestId('btn-windows').click();
  await page.getByTestId('menu-' + id).click();
}
