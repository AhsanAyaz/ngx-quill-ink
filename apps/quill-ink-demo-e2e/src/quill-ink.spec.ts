import { test, expect, Page } from '@playwright/test';

/** Fraction of non-transparent pixels on a canvas (via toDataURL diff). */
async function canvasHasInk(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let inked = 0;
    for (let i = 3; i < data.length; i += 40) {
      if (data[i] > 20) inked++;
    }
    return inked > 20;
  }, selector);
}

test('hero writes handwriting onto the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('ngx-quill-ink');
  // initial text animates on load
  await page.waitForTimeout(2500);
  expect(await canvasHasInk(page, '#hero quill-ink canvas')).toBe(true);
});

test('typing text writes it', async ({ page }) => {
  await page.goto('/');
  await page.fill('#hero textarea', 'e2e handwriting check');
  await page.click('#hero button:has-text("Write it")');
  await page.waitForTimeout(3000);
  expect(await canvasHasInk(page, '#hero quill-ink canvas')).toBe(true);
});

test('streaming demo writes tokens as ink', async ({ page }) => {
  await page.goto('/');
  const before = await canvasHasInk(page, '#streaming quill-ink canvas');
  expect(before).toBe(false);
  await page.click('#streaming button');
  await page.waitForTimeout(4000);
  expect(await canvasHasInk(page, '#streaming quill-ink canvas')).toBe(true);
});

test('capture: drawing emits a PNG after the page drinks the ink', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#capture quill-ink canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + 60 + i * 12, box.y + 100 + Math.sin(i / 2) * 30, { steps: 2 });
  }
  await page.mouse.up();
  // idle commit (2800ms) + dissolve (~1.2s)
  await expect(page.locator('#capture .capture-result img')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#capture .capture-result .meta')).toContainText('stroke');
});
