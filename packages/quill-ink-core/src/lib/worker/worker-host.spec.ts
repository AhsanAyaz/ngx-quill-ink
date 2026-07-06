import { describe, expect, it } from 'vitest';
import { SkeletonWorkerHost } from './worker-host';
import { handleSkeletonRequest } from './skeleton-worker.entry';

function barAlpha(width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) alpha[y * width + x] = 255;
  }
  return alpha;
}

describe('SkeletonWorkerHost (sync fallback path — no Worker in node)', () => {
  it('thins via the synchronous fallback and returns strokes', async () => {
    const host = new SkeletonWorkerHost();
    const result = await host.thin(barAlpha(16, 8), 16, 8);
    expect(result.strokes.length).toBeGreaterThan(0);
    expect(result.width).toBe(16);
    host.destroy();
  });

  it('forceSync path matches the worker protocol result', async () => {
    const alpha = barAlpha(16, 8);
    const host = new SkeletonWorkerHost(true);
    const viaHost = await host.thin(alpha, 16, 8);

    const viaProtocol = handleSkeletonRequest({
      id: 1,
      alpha: alpha.slice().buffer,
      width: 16,
      height: 8,
    });
    expect(viaProtocol.error).toBeUndefined();
    expect(viaProtocol.strokes).toBeDefined();
    // same stroke count and same flattened coordinates
    expect(viaProtocol.strokes).toHaveLength(viaHost.strokes.length);
    const flatHost = viaHost.strokes.map((s) => s.flatMap((p) => [p.x, p.y]));
    expect(viaProtocol.strokes).toEqual(flatHost);
    host.destroy();
  });

  it('rejects after destroy', async () => {
    const host = new SkeletonWorkerHost();
    host.destroy();
    await expect(host.thin(barAlpha(8, 8), 8, 8)).rejects.toThrow(/disposed/);
  });

  it('protocol reports errors instead of throwing', () => {
    const res = handleSkeletonRequest({
      id: 7,
      alpha: new ArrayBuffer(4),
      width: 100, // inconsistent dims → pipeline error surfaces as .error
      height: 100,
    });
    expect(res.id).toBe(7);
    // either succeeds with empty strokes or reports an error; must not throw
    expect(res.error !== undefined || res.strokes !== undefined).toBe(true);
  });
});
