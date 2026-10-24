import type { Bounds } from '../../shared/contracts.ts';
import { mean, median } from './dsp.ts';
import { luminance, validPlane } from './pixels.ts';
import type { PixelPlane } from './pixels.ts';
export type MotionPlane = {
    width: number;
    height: number;
    data: Float32Array;
};
export const prepareMotionFrame = (p: PixelPlane): MotionPlane => ({ width: p.width, height: p.height, data: luminance(p) });
export type PatchAnchor = {
    x: number;
    y: number;
};
export type PatchMotion = {
    dy: number | null;
    dx: number | null;
    reason: string | null;
    metrics: Record<string, number>;
};
const SIZE = 24, RADIUS = 4;
export function torsoAnchors(b: Bounds, p: PixelPlane): PatchAnchor[] {
    const x0 = b.x * p.width, y0 = b.y * p.height, w = b.width * p.width, h = b.height * p.height;
    if (w < 3 * SIZE + 2 * RADIUS + 4 || h < 3 * SIZE + 2 * RADIUS + 4)
        return [];
    return Array.from({ length: 9 }, (_, i) => ({ x: Math.round(x0 + RADIUS + 2 + (w - SIZE - 2 * RADIUS - 4) * (i % 3) / 2), y: Math.round(y0 + RADIUS + 2 + (h - SIZE - 2 * RADIUS - 4) * Math.floor(i / 3) / 2) }));
}
export function anchorsInside(anchors: PatchAnchor[], b: Bounds, p: PixelPlane): boolean {
    return anchors.length === 9 && anchors.every(a => a.x - RADIUS >= b.x * p.width && a.y - RADIUS >= b.y * p.height && a.x + SIZE + RADIUS <= (b.x + b.width) * p.width && a.y + SIZE + RADIUS <= (b.y + b.height) * p.height);
}
/** Fixed image-coordinate patches: changing the ROI never becomes displacement. */
export function estimatePatchDisplacement(previous: PixelPlane, current: PixelPlane, anchors: PatchAnchor[]): PatchMotion {
    if (!validPlane(previous) || !validPlane(current))
        return { dx: null, dy: null, reason: 'Invalid image pixels', metrics: {} };
    return estimateLumaDisplacement(prepareMotionFrame(previous), prepareMotionFrame(current), anchors);
}
/** Reuses one luminance conversion per frame across torso and background patches. */
export function estimateLumaDisplacement(previous: MotionPlane, current: MotionPlane, anchors: PatchAnchor[]): PatchMotion {
    const fail = (reason: string, metrics: Record<string, number> = {}): PatchMotion => ({ dx: null, dy: null, reason, metrics });
    if (previous.width !== current.width || previous.height !== current.height || previous.data.length !== previous.width * previous.height || current.data.length !== current.width * current.height)
        return fail('Image geometry changed');
    const a = previous.data, b = current.data, width = current.width, results: {
        dx: number;
        dy: number;
        ncc: number;
        texture: number;
    }[] = [];
    let exposureFailures = 0;
    for (const anchor of anchors) {
        const { x, y } = anchor;
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < RADIUS || y < RADIUS || x + SIZE + RADIUS > width || y + SIZE + RADIUS > current.height)
            continue;
        const template: number[] = [];
        let currentMean = 0;
        for (let py = 0; py < SIZE; py++)
            for (let px = 0; px < SIZE; px++) {
                template.push(a[(y + py) * width + x + px]);
                currentMean += b[(y + py) * width + x + px];
            }
        const m = mean(template), texture = Math.sqrt(mean(template.map(v => (v - m) ** 2)));
        if (texture < 0.02)
            continue;
        if (Math.abs(currentMean / (SIZE * SIZE) - m) > 0.03) {
            exposureFailures++;
            continue;
        }
        const centered = template.map(v => v - m), norm = texture * texture * template.length, scores: number[] = [];
        for (let dy = -RADIUS; dy <= RADIUS; dy++)
            for (let dx = -RADIUS; dx <= RADIUS; dx++) {
                let sum = 0, squares = 0, dot = 0, index = 0;
                for (let py = 0; py < SIZE; py++)
                    for (let px = 0; px < SIZE; px++) {
                        const v = b[(y + dy + py) * width + x + dx + px];
                        sum += v;
                        squares += v * v;
                        dot += centered[index++] * v;
                    }
                const den = Math.sqrt(norm * Math.max(0, squares - sum * sum / template.length));
                scores.push(den > 1e-12 ? dot / den : -1);
            }
        let best = 0;
        for (let i = 1; i < scores.length; i++)
            if (scores[i] > scores[best])
                best = i;
        const bx = best % 9, by = Math.floor(best / 9), peak = scores[best];
        if (bx === 0 || by === 0 || bx === 8 || by === 8 || peak < 0.8)
            continue;
        let other = -1;
        for (let y2 = 1; y2 < 8; y2++)
            for (let x2 = 1; x2 < 8; x2++) {
                if (Math.abs(x2 - bx) <= 1 && Math.abs(y2 - by) <= 1)
                    continue;
                const k = y2 * 9 + x2, v = scores[k];
                if (v >= scores[k - 1] && v >= scores[k + 1] && v >= scores[k - 9] && v >= scores[k + 9])
                    other = Math.max(other, v);
            }
        if (peak - other < 0.05)
            continue;
        const refine = (lo: number, hi: number) => { const den = lo - 2 * peak + hi; return den < -1e-5 ? Math.max(-0.5, Math.min(0.5, 0.5 * (lo - hi) / den)) : NaN; };
        const rx = refine(scores[best - 1], scores[best + 1]), ry = refine(scores[best - 9], scores[best + 9]);
        if (!Number.isFinite(rx) || !Number.isFinite(ry))
            continue;
        results.push({ dx: bx - RADIUS + rx, dy: by - RADIUS + ry, ncc: peak, texture });
    }
    const metrics = { validPatches: results.length, patchCount: anchors.length, texture: results.length ? median(results.map(r => r.texture)) : 0, ncc: results.length ? median(results.map(r => r.ncc)) : 0 };
    // A single-patch call is useful for a local probe; breathing requires >=5/9 itself.
    if (!results.length)
        return fail(exposureFailures ? 'Torso exposure changed' : 'No textured unambiguous interior correlation peak', metrics);
    const dx = median(results.map(r => r.dx)), dy = median(results.map(r => r.dy));
    if (results.filter(r => Math.hypot(r.dx - dx, r.dy - dy) < 0.3).length < Math.ceil(results.length * 0.6))
        return fail('Patch motion is inconsistent', metrics);
    return { dx, dy, reason: null, metrics };
}
/** Background patches must be wholly outside the selected torso with a 4px guard. */
export function backgroundAnchors(b: Bounds, p: PixelPlane): PatchAnchor[] {
    const anchors: PatchAnchor[] = [];
    for (const y of [RADIUS, Math.floor((p.height - SIZE) / 2), p.height - SIZE - RADIUS])
        for (const x of [RADIUS, Math.floor((p.width - SIZE) / 2), p.width - SIZE - RADIUS]) {
            if (x >= RADIUS && y >= RADIUS && (x + SIZE + RADIUS <= b.x * p.width || x - RADIUS >= (b.x + b.width) * p.width || y + SIZE + RADIUS <= b.y * p.height || y - RADIUS >= (b.y + b.height) * p.height))
                anchors.push({ x, y });
        }
    return anchors;
}
