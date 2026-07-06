/**
 * Export the surface as a PNG blob: white background baked, `scale`x device
 * pixels (default 2x), suitable for vision LLM input.
 */
export async function exportSurfacePNG(
  sources: CanvasImageSource[],
  width: number,
  height: number,
  scale = 2
): Promise<Blob> {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(width * scale));
  out.height = Math.max(1, Math.round(height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('quill-ink: could not acquire 2d context for export');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  for (const src of sources) {
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  return new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('quill-ink: toBlob failed'))), 'image/png');
  });
}
