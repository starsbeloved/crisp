import { describe, expect, it } from 'vitest';
import { estimateCameraPulse } from '../client/sensing/rppg.ts';
import { estimateBreathing } from '../client/sensing/breathing.ts';
import type { TimedRGB, ScalarSample } from '../shared/contracts.ts';
function rgb(seconds = 30, hz = 1.2, fps = 30): TimedRGB[] {
    return Array.from({ length: Math.floor(seconds * fps) + 1 }, (_, i) => {
        const wave = Math.sin(2 * Math.PI * hz * i / fps), noise = Math.sin(i * 1.731) * 0.0001;
        return { tMs: i * 1000 / fps, r: 0.5 + wave * 0.0005 + noise, g: 0.4 + wave * 0.003 + noise, b: 0.3 + wave * 0.0003 - noise, saturationFraction: { r: 0, g: 0, b: 0 } };
    });
}
function displacement(seconds = 45, hz = 0.25, fps = 30): ScalarSample[] {
    return Array.from({ length: seconds * fps + 1 }, (_, i) => ({ tMs: i * 1000 / fps, value: 0.6 * Math.sin(2 * Math.PI * hz * i / fps) + 0.005 * Math.sin(i * 1.371) }));
}
describe('camera POS signal acceptance', () => {
    it('recovers 72 BPM from normalized RGB through POS', () => {
        const result = estimateCameraPulse(rgb());
        expect(result.quality).toBe('usable');
        expect(result.bpm).toBeCloseTo(72, 0);
        expect(result.metrics.cadenceHz).toBeCloseTo(30);
        expect(result.metrics.peakToNoise).toBeGreaterThanOrEqual(3);
    });
    it.each(['short', 'flat', 'saturated', 'step', 'gap', 'cadence', 'nonfinite', 'order', 'illumination', 'noise', 'harmonic'] as const)('rejects %s RGB without a plausible fallback', kind => {
        let input = rgb();
        if (kind === 'short')
            input = rgb(29.99);
        if (kind === 'flat')
            input = input.map(s => ({ ...s, r: 0.5, g: 0.4, b: 0.3 }));
        if (kind === 'saturated')
            input[100].saturationFraction.r = 0.05;
        if (kind === 'step')
            input = input.map((s, i) => i > 450 ? { ...s, r: s.r + 0.12, g: s.g + 0.12, b: s.b + 0.12 } : s);
        if (kind === 'gap')
            input = input.filter((_, i) => i < 400 || i > 410);
        if (kind === 'cadence')
            input = rgb(30, 1.2, 10);
        if (kind === 'nonfinite')
            input[4].r = NaN;
        if (kind === 'order')
            input[4].tMs = input[3].tMs;
        if (kind === 'illumination')
            input = input.map(s => { const a = 1 + 0.03 * Math.sin(2 * Math.PI * 1.2 * s.tMs / 1000); return { ...s, r: 0.5 * a, g: 0.4 * a, b: 0.3 * a }; });
        if (kind === 'noise') {
            let seed = 7;
            const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; };
            input = input.map(s => ({ ...s, r: 0.5 + noise() * 0.01, g: 0.4 + noise() * 0.01, b: 0.3 + noise() * 0.01 }));
        }
        if (kind === 'harmonic')
            input = input.map(s => { const w = 0.003 * Math.sin(2 * Math.PI * 2.4 * s.tMs / 1000) + 0.002 * Math.sin(2 * Math.PI * 1.2 * s.tMs / 1000); return { ...s, g: 0.4 + w }; });
        expect(estimateCameraPulse(input).bpm).toBeNull();
    });
});
describe('independent torso respiratory DSP', () => {
    it('recovers 15 breaths/min from displacement', () => { const result = estimateBreathing(displacement()); expect(result.quality).toBe('usable'); expect(result.breathsPerMin).toBeCloseTo(15, 0); });
    it.each(['short', 'flat', 'drift', 'unsupported', 'gap', 'cadence', 'noise'] as const)('rejects %s displacement', kind => {
        let input = displacement();
        if (kind === 'short')
            input = displacement(44);
        if (kind === 'flat')
            input = input.map(s => ({ ...s, value: 1 }));
        if (kind === 'drift')
            input = input.map(s => ({ ...s, value: s.tMs / 1000 }));
        if (kind === 'unsupported')
            input = displacement(45, 0.9);
        if (kind === 'gap')
            input = input.filter((_, i) => i < 300 || i > 312);
        if (kind === 'cadence')
            input = displacement(45, 0.25, 10);
        if (kind === 'noise') {
            let seed = 11;
            input = input.map(s => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return { ...s, value: seed / 2 ** 32 - 0.5 }; });
        }
        expect(estimateBreathing(input).breathsPerMin).toBeNull();
    });
});
