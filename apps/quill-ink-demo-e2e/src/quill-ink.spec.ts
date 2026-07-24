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

test('capture: drawing emits a PNG after the page drinks the ink', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.locator('#capture quill-ink canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(
      box.x + 60 + i * 12,
      box.y + 100 + Math.sin(i / 2) * 30,
      { steps: 2 },
    );
  }
  await page.mouse.up();
  // idle commit (2800ms) + dissolve (~1.2s)
  await expect(page.locator('#capture .capture-result img')).toBeVisible({
    timeout: 8000,
  });
  await expect(page.locator('#capture .capture-result .meta')).toContainText(
    'stroke',
  );
});

/**
 * Runs at deviceScaleFactor 2 on purpose. The dissolve paints through a
 * dpr-scaled layer context, so a bounds-scaling mistake is invisible at
 * dpr 1 (where the default desktop projects run) and only shows up on
 * Retina-class screens — which is how one shipped once.
 */
test.describe('capture on a high-DPI screen', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the page visibly drinks the ink, it does not blink out', async ({
    page,
  }) => {
    await page.goto('/');
    const canvas = page.locator('#capture quill-ink canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;

    /**
     * Dark pixels on the surface — the ink — counted per horizontal half.
     * The paper texture underneath is light, so a luminance threshold
     * separates ink from grain.
     */
    const inkStats = () =>
      canvas.evaluate((c: HTMLCanvasElement) => {
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let total = 0;
        let sumX = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 10 && data[i] + data[i + 1] + data[i + 2] < 300) {
            total++;
            sumX += (i / 4) % c.width;
          }
        }
        return { total, meanX: total ? sumX / total : 0 };
      });

    const blank = await inkStats(); // paper only, no ink yet
    const inkPixels = async () => (await inkStats()).total;

    await page.mouse.move(box.x + 60, box.y + 100);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(
        box.x + 60 + i * 12,
        box.y + 100 + Math.sin(i / 2) * 30,
        { steps: 2 },
      );
    }
    await page.mouse.up();
    const drawn = await inkStats();
    expect(drawn.total).toBeGreaterThan(blank.total);

    // Sample mid-sweep: idle commit fires at 2800ms, the dissolve runs ~1200ms.
    await page.waitForTimeout(3400);
    const mid = await inkStats();
    expect(mid.total).toBeLessThan(drawn.total); // ink is being absorbed…
    expect(mid.total).toBeGreaterThan(blank.total); // …but is not gone yet

    // The page drinks left-to-right, so the ink still on the page mid-sweep
    // sits further right than the ink we drew. Regression guard: a dpr-scaled
    // bounds mistake shifts the sweep off the strokes and breaks this
    // signature (and at dpr 1 hides it entirely — hence deviceScaleFactor).
    expect(mid.meanX).toBeGreaterThan(drawn.meanX);

    // and the page finishes drinking it
    await expect.poll(inkPixels, { timeout: 5000 }).toBeLessThanOrEqual(
      blank.total,
    );
  });
});
