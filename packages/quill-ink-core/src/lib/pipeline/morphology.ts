import { Bitmap } from './types';

/**
 * 3x3 morphological close (dilate then erode). Fills 1px gaps and pinholes
 * so Zhang-Suen doesn't fragment strokes on thin fonts.
 */
export function morphologicalClose(src: Bitmap): Bitmap {
  return erode3(dilate3(src));
}

function dilate3(src: Bitmap): Bitmap {
  const { data, width, height } = src;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (data[yy * width + xx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * width + x] = v;
    }
  }
  return { data: out, width, height };
}

function erode3(src: Bitmap): Bitmap {
  const { data, width, height } = src;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1;
      for (let dy = -1; dy <= 1 && v; dy++) {
        const yy = y + dy;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          // pixels beyond the border count as background
          if (yy < 0 || yy >= height || xx < 0 || xx >= width || !data[yy * width + xx]) {
            v = 0;
            break;
          }
        }
      }
      out[y * width + x] = v;
    }
  }
  return { data: out, width, height };
}
