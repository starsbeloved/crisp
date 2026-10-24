import type { TimedRGB, PulseEstimate } from '../../shared/contracts.ts';
import { EPS, frequency, mean, resample, timing, variance } from './dsp.ts';
/** POS projections and overlap-add from Wang et al.; see workstream note for source. */
export function estimateCameraPulse(samples: TimedRGB[]): PulseEstimate {
    const t = timing(samples, 30000), metrics = { ...t.metrics };
    const reject = (reason: string, collecting = false): PulseEstimate => ({ quality: collecting ? 'collecting' : 'low-quality', bpm: null, reason, metrics });
    if (t.reason)
        return reject(t.reason, (metrics.durationMs ?? 0) < 30000);
    const channels = ['r', 'g', 'b'] as const;
    for (const c of channels) {
        if (samples.some(s => !Number.isFinite(s[c]) || s[c] <= 0 || s[c] >= 1 || !Number.isFinite(s.saturationFraction[c]) || s.saturationFraction[c] < 0 || s.saturationFraction[c] > 1))
            return reject('Invalid normalized RGB sample');
        metrics[`saturation_${c}`] = Math.max(...samples.map(s => s.saturationFraction[c]));
        if (metrics[`saturation_${c}`] >= 0.05)
            return reject('At least 5% channel clipping');
        for (let i = 1; i < samples.length; i++)
            if (Math.abs(samples[i][c] - samples[i - 1][c]) > 0.08)
                return reject('Abrupt illumination or exposure change');
    }
    const rgb = channels.map(c => resample(samples, 30, s => s[c])), n = rgb[0].length, signal = Array<number>(n).fill(0), win = 48;
    let usable = 0;
    for (let end = win; end <= n; end++) {
        const start = end - win, C = rgb.map(a => { const w = a.slice(start, end), m = mean(w); return w.map(v => v / m); });
        const s1 = C[1].map((g, i) => g - C[2][i]), s2 = C[1].map((g, i) => g + C[2][i] - 2 * C[0][i]);
        const v1 = variance(s1), v2 = variance(s2);
        if (v1 < EPS || v2 < EPS)
            continue;
        const alpha = Math.sqrt(v1 / v2), h = s1.map((v, i) => v + alpha * s2[i]), m = mean(h);
        for (let i = 0; i < win; i++)
            signal[start + i] += h[i] - m;
        usable++;
    }
    metrics.posWindows = usable;
    if (usable < (n - win) * 0.9)
        return reject('Insufficient chrominance variation for POS');
    const f = frequency(signal, 30, 0.7, 3, 5);
    Object.assign(metrics, f.metrics);
    return f.hz === null ? reject(f.reason!) : { quality: 'usable', bpm: f.hz * 60, reason: null, metrics };
}
import type { SensorContext, SensorRuntime } from '../../shared/contracts.ts';
import type { PixelReaderOptions } from './pixels.ts';
import { createPixelReader, sampleFaceRgb } from './pixels.ts';
import { createSignalRuntime } from './runtime.ts';
import type { MeasurementEmitter } from './runtime.ts';
export function createRppgRuntime(context: SensorContext, emit: MeasurementEmitter, options: PixelReaderOptions = {}): SensorRuntime {
    const read = options.readPixels ?? createPixelReader();
    let previous: TimedRGB | null = null;
    return createSignalRuntime<TimedRGB>(context, emit, { stream: 'rppg', getContinuityKey:options.getContinuityKey, durationMs: 30000, clear: () => { previous = null; }, extract(f) {
            const p = read(f);
            if (p.width !== f.frame.width || p.height !== f.frame.height)
                return { sample: null, reason: 'Camera pixel geometry mismatch' };
            const sample = sampleFaceRgb(p, f.faceSkin, f.frame.sourceAtMs);
            if (!sample)
                return { sample: null, reason: 'No usable landmark-defined face skin ROI' };
            const channels = ['r', 'g', 'b'] as const;
            if (channels.some(c => sample.saturationFraction[c] >= 0.05))
                return { sample: null, reason: 'Face color channel clipping' };
            if (channels.some(c => sample[c] < 0.02 || sample[c] > 0.98))
                return { sample: null, reason: 'Face illumination outside usable range' };
            if (previous && channels.some(c => Math.abs(sample[c] - previous![c]) > 0.08))
                return { sample: null, reason: 'Face exposure changed' };
            previous = sample;
            return { sample, reason: null, metrics: { roiCount: f.faceSkin.length } };
        }, estimate(s) { const e = estimateCameraPulse(s); return { ...e, value: e.bpm }; } });
}
export const createCameraPulseRuntime = createRppgRuntime;
