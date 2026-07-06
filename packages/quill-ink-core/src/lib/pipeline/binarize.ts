import { Bitmap } from './types';

/**
 * Threshold RGBA pixel data (black glyph on white) to a binary bitmap.
 * A pixel is ink when its luminance is below 50%.
 */
export function binarize(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Bitmap {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const lum = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2];
    // respect alpha: transparent pixels are background
    const alpha = rgba[p + 3] / 255;
    const effective = lum * alpha + 255 * (1 - alpha);
    data[i] = effective < 128 ? 1 : 0;
  }
  return { data, width, height };
}

/** Binarize a single-channel coverage/alpha buffer (0..255, ink = high). */
export function binarizeAlpha(alpha: Uint8Array | Uint8ClampedArray, width: number, height: number): Bitmap {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = alpha[i] >= 128 ? 1 : 0;
  return { data, width, height };
}
