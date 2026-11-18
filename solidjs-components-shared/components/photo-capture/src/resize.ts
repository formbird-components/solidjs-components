// Getting a photo ready to upload: phone cameras take 12-megapixel photos, far more than a record
// needs, so photos larger than `maxDimension` are scaled down in a canvas and sent as JPEG. Photos
// that already fit, and files that aren't raster images, go up untouched.

import { canDownscale, scaledSize, withExtension } from './photos';

/** A file ready to upload, with its pixel size when it is an image the browser can decode. */
export interface PreparedFile {
  file: File;
  width?: number;
  height?: number;
}

const JPEG_QUALITY = 0.85;

/** Decodes an image, upright (camera photos carry their rotation in EXIF). */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Whether any pixel of the canvas is see-through (a PNG logo, a screenshot with rounded corners). */
function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const data = context.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/**
 * Scales a photo down to fit `maxDimension` × `maxDimension` when it is bigger. The result is a
 * JPEG (quality 0.85), or a PNG when the image has transparent pixels, so a transparent background
 * doesn't turn black. Anything that can't be decoded or re-encoded is returned as it is.
 * @param file - The chosen or dropped file
 * @param maxDimension - Longest side in pixels (0: keep the original)
 * @returns The file to upload and its size
 */
export async function prepareImage(file: File, maxDimension: number): Promise<PreparedFile> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return { file };
  let image: Awaited<ReturnType<typeof decode>>;
  try {
    image = await decode(file);
  } catch {
    return { file }; // a type this browser can't read (HEIC on most): upload it as it is
  }
  try {
    const size = scaledSize(image.width, image.height, maxDimension);
    if (!size.scaled || !canDownscale(file.type)) return { file, width: image.width, height: image.height };
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { file, width: image.width, height: image.height };
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image.source, 0, 0, size.width, size.height);
    const transparent = file.type !== 'image/jpeg' && hasTransparency(context, size.width, size.height);
    const type = transparent ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
    if (!blob) return { file, width: image.width, height: image.height };
    const name = withExtension(file.name, transparent ? 'png' : 'jpg');
    return { file: new File([blob], name, { type, lastModified: file.lastModified }), width: size.width, height: size.height };
  } finally {
    image.close();
  }
}
