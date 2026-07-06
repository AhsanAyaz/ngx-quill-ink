/** Binary bitmap: 1 = ink, 0 = background. Row-major, width*height entries. */
export interface Bitmap {
  data: Uint8Array;
  width: number;
  height: number;
}

/** A point on a stroke path. */
export interface Point {
  x: number;
  y: number;
}

/** A single pen stroke as an ordered polyline. */
export type Stroke = Point[];

/** Result of the glyph pipeline: ordered strokes in bitmap pixel space. */
export interface GlyphStrokes {
  strokes: Stroke[];
  width: number;
  height: number;
}

export function createBitmap(width: number, height: number): Bitmap {
  return { data: new Uint8Array(width * height), width, height };
}
