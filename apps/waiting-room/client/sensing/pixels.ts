import type { BoundFrame, Bounds, TimedRGB } from '../../shared/contracts.ts';
export type PixelPlane = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
};
export type PixelReaderOptions = {
    readPixels?: (frame: BoundFrame) => PixelPlane;
    getContinuityKey?: () => string | null;
};
export function validBounds(b: Bounds): boolean { return [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0 && b.x + b.width <= 1 + 1e-9 && b.y + b.height <= 1 + 1e-9; }
export function validPlane(p: PixelPlane): boolean { return Number.isInteger(p.width) && Number.isInteger(p.height) && p.width > 0 && p.height > 0 && p.data.length === p.width * p.height * 4; }
export function createPixelReader() {
    let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
    return (bound: BoundFrame): PixelPlane => {
        if (!canvas)
            canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
        const { width, height, image } = bound.frame;
        if (canvas.width !== width)
            canvas.width = width;
        if (canvas.height !== height)
            canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
        if (!context)
            throw new Error('Pixel canvas unavailable');
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        return { width, height, data };
    };
}
/** The identity lane supplies landmark-defined skin rectangles, excluding eyes/mouth. */
export function sampleFaceRgb(p: PixelPlane, rois: Bounds[], tMs: number): TimedRGB | null {
    if (!validPlane(p) || rois.length === 0 || rois.some(b => !validBounds(b)))
        return null;
    const sums = [0, 0, 0], clipped = [0, 0, 0];
    let count = 0;
    for (const b of rois) {
        const x0 = Math.ceil(b.x * p.width), y0 = Math.ceil(b.y * p.height), x1 = Math.floor((b.x + b.width) * p.width), y1 = Math.floor((b.y + b.height) * p.height);
        if (x1 - x0 < 4 || y1 - y0 < 4)
            return null;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const i = (y * p.width + x) * 4;
                count++;
                for (let c = 0; c < 3; c++) {
                    const v = p.data[i + c];
                    sums[c] += v;
                    if (v <= 1 || v >= 254)
                        clipped[c]++;
                }
            }
    }
    if (count < 100)
        return null;
    return { tMs, r: sums[0] / count / 255, g: sums[1] / count / 255, b: sums[2] / count / 255, saturationFraction: { r: clipped[0] / count, g: clipped[1] / count, b: clipped[2] / count } };
}
export function luminance(p: PixelPlane): Float32Array {
    const a = new Float32Array(p.width * p.height);
    for (let i = 0; i < a.length; i++)
        a[i] = (0.2126 * p.data[i * 4] + 0.7152 * p.data[i * 4 + 1] + 0.0722 * p.data[i * 4 + 2]) / 255;
    return a;
}
