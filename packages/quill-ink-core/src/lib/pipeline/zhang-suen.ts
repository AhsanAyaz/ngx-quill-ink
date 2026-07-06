import { Bitmap } from './types';

/**
 * Zhang-Suen thinning: reduces an ink region to a 1px-wide skeleton while
 * preserving connectivity. Operates on typed arrays only — safe in Workers
 * and Node (font pack generator shares this exact code).
 */
export function zhangSuenThin(src: Bitmap): Bitmap {
  const { width, height } = src;
  // copy — never mutate the input
  const img = new Uint8Array(src.data);
  const toClear: number[] = [];

  // neighbors P2..P9 clockwise from north
  const offsets = (w: number) => [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1];
  const off = offsets(width);

  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      toClear.length = 0;
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          const i = row + x;
          if (!img[i]) continue;
          const p = [
            img[i + off[0]],
            img[i + off[1]],
            img[i + off[2]],
            img[i + off[3]],
            img[i + off[4]],
            img[i + off[5]],
            img[i + off[6]],
            img[i + off[7]],
          ];
          const b = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          if (pass === 0) {
            if (p[0] && p[2] && p[4]) continue; // P2*P4*P6
            if (p[2] && p[4] && p[6]) continue; // P4*P6*P8
          } else {
            if (p[0] && p[2] && p[6]) continue; // P2*P4*P8
            if (p[0] && p[4] && p[6]) continue; // P2*P6*P8
          }
          toClear.push(i);
        }
      }
      if (toClear.length) {
        changed = true;
        for (const i of toClear) img[i] = 0;
      }
    }
  }
  return { data: img, width, height };
}
