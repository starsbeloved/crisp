import type { DetectedFace } from '../lib/face.ts';
import type { FaceSample } from './signals/index.ts';

/** Two inner cheeks plus exposed forehead above the brows, in detection pixels.
 * Keep the existing export name for camera callers. No patch extends beyond the detected face.
 */
export function cheekPatches(face: DetectedFace): { x: number; y: number; w: number; h: number }[] {
  const lm = face.landmarks;
  if (lm.length !== 68) return [];
  const eyeY = (lm[36].y + lm[45].y) / 2, noseY = lm[33].y, mouthY = (lm[48].y + lm[54].y) / 2;
  const top = Math.max(eyeY + (noseY - eyeY) * 0.45, face.box.y);
  const bottom = Math.min(mouthY, face.box.y + face.box.h);
  const cheeks = [[lm[36].x, lm[31].x], [lm[35].x, lm[45].x]].map(([left, right]) =>
    ({ x: left + (right - left) * 0.2, y: top, w: (right - left) * 0.6, h: (bottom - top) * 0.65 }));
  const browY = Math.min(lm[19].y, lm[24].y);
  const forehead = { x: lm[36].x + (lm[45].x - lm[36].x) * 0.2,
    y: browY - face.box.h * 0.18, w: (lm[45].x - lm[36].x) * 0.6, h: face.box.h * 0.12 };
  return [...cheeks, forehead].map(patch => {
    const x = Math.max(face.box.x, patch.x), y = Math.max(face.box.y, patch.y);
    return { x, y, w: Math.min(face.box.x + face.box.w, patch.x + patch.w) - x,
      h: Math.min(face.box.y + face.box.h, patch.y + patch.h) - y };
  })
    .filter(patch => patch.w >= 3 && patch.h >= 3 && Object.values(patch).every(Number.isFinite));
}

export function meanCheekSample(pixels: Pick<ImageData, 'data' | 'width' | 'height'>, face: DetectedFace,
  detectionWidth: number, detectionHeight: number, now: number, sourceWidth: number): FaceSample | null {
  if (![pixels.width, pixels.height, detectionWidth, detectionHeight, sourceWidth].every(v => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(now)) return null;
  const sx = pixels.width / detectionWidth, sy = pixels.height / detectionHeight;
  let r = 0, g = 0, b = 0, count = 0;
  for (const patch of cheekPatches(face)) {
    const left = Math.max(0, Math.floor(patch.x * sx)), top = Math.max(0, Math.floor(patch.y * sy));
    const right = Math.min(pixels.width, Math.ceil((patch.x + patch.w) * sx)), bottom = Math.min(pixels.height, Math.ceil((patch.y + patch.h) * sy));
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const i = (y * pixels.width + x) * 4;
      r += pixels.data[i]; g += pixels.data[i + 1]; b += pixels.data[i + 2]; count++;
    }
  }
  if (!count) return null;
  const rgb: FaceSample['rgb'] = [r / count, g / count, b / count];
  return { t: now, rgb, brightness: rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722, faceWidthPx: face.box.w * sourceWidth / detectionWidth };
}
