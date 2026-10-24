/** Prototype numerical gates; none is a clinically calibrated quality score. */
export const EPS = 1e-16;
export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
export const variance = (a: number[]) => { const m = mean(a); return mean(a.map(v => (v - m) ** 2)); };
export function detrend(a: number[]): number[] {
    const mid = (a.length - 1) / 2, m = mean(a);
    let num = 0, den = 0;
    for (let i = 0; i < a.length; i++) {
        num += (i - mid) * (a[i] - m);
        den += (i - mid) ** 2;
    }
    return a.map((v, i) => v - m - (den ? num / den : 0) * (i - mid));
}
export function timing(samples: {
    tMs: number;
}[], duration: number): {
    reason: string | null;
    metrics: Record<string, number>;
} {
    if (samples.length < 2 || samples.some(s => !Number.isFinite(s.tMs)))
        return { reason: 'Missing or invalid sample timestamps', metrics: {} };
    let maxGapMs = 0;
    for (let i = 1; i < samples.length; i++) {
        const gap = samples[i].tMs - samples[i - 1].tMs;
        if (gap <= 0)
            return { reason: 'Sample timestamps must increase', metrics: {} };
        maxGapMs = Math.max(maxGapMs, gap);
    }
    const durationMs = samples.at(-1)!.tMs - samples[0].tMs, cadenceHz = (samples.length - 1) * 1000 / durationMs;
    const metrics = { durationMs, cadenceHz, maxGapMs, sampleCount: samples.length };
    return { reason: durationMs < duration - 1e-6 ? `Collect ${duration / 1000} seconds of contiguous signal` : durationMs > duration + 1000 ? 'Window exceeds supported duration' : maxGapMs > 200 ? 'Sample gap exceeds 200 ms' : cadenceHz < 15 - 1e-6 ? 'Actual sample cadence below 15 Hz' : null, metrics };
}
export function resample<T extends {
    tMs: number;
}>(samples: T[], rate: number, get: (s: T) => number): number[] {
    const start = samples[0].tMs, n = Math.floor((samples.at(-1)!.tMs - start) * rate / 1000);
    let j = 0;
    return Array.from({ length: n }, (_, i) => { const t = start + i * 1000 / rate; while (j + 1 < samples.length - 1 && samples[j + 1].tMs < t)
        j++; const a = samples[j], b = samples[j + 1]; return get(a) + (get(b) - get(a)) * (t - a.tMs) / (b.tMs - a.tMs); });
}
export type FrequencyResult = {
    hz: number | null;
    reason: string | null;
    metrics: Record<string, number>;
};
export function frequency(values: number[], rate: number, low: number, high: number, inspectHigh: number): FrequencyResult {
    const signal = detrend(values), n = signal.length, v = mean(signal.map(x => x * x)), binHz = rate / n;
    const fail = (reason: string, metrics: Record<string, number> = {}): FrequencyResult => ({ hz: null, reason, metrics: { variance: v, binHz, ...metrics } });
    if (!Number.isFinite(v) || v < EPS)
        return fail('Signal is flat after detrending');
    const hann = signal.map((x, i) => x * 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))));
    const power: number[] = [];
    for (let k = 0; k <= Math.min(Math.floor(inspectHigh / binHz), Math.floor(n / 2)); k++) {
        let re = 0, im = 0;
        for (let i = 0; i < n; i++) {
            const a = 2 * Math.PI * k * i / n;
            re += hann[i] * Math.cos(a);
            im -= hann[i] * Math.sin(a);
        }
        power.push(re * re + im * im);
    }
    const first = Math.ceil(low / binHz), last = Math.floor(high / binHz);
    let peak = first;
    for (let k = first + 1; k <= last; k++)
        if (power[k] > power[peak])
            peak = k;
    let dominant = Math.max(1, Math.floor(0.04 / binHz));
    for (let k = dominant + 1; k < power.length; k++)
        if (power[k] > power[dominant])
            dominant = k;
    if ((dominant * binHz < low - binHz / 2 || dominant * binHz > high + binHz / 2) && power[dominant] > power[peak])
        return fail('Dominant frequency is outside supported band');
    let peakPower = 0, noisePower = 0, peakCount = 0, noiseCount = 0;
    for (let k = first; k <= last; k++) {
        if (Math.abs(k - peak) <= 1) {
            peakPower += power[k];
            peakCount++;
        }
        else {
            noisePower += power[k];
            noiseCount++;
        }
    }
    const noise = noisePower / noiseCount * peakCount, peakToNoise = peakPower / noise, concentration = peakPower / (peakPower + noisePower);
    if (noise < EPS || !Number.isFinite(peakToNoise))
        return fail('Residual spectral noise is numerically zero');
    const metrics = { peakToNoise, concentration };
    if (peakToNoise < 3 || concentration < 0.35)
        return fail('Insufficient periodic signal', metrics);
    // A strong fundamental with a stronger second harmonic is ambiguous: do not double the rate.
    const half = Math.round(peak / 2);
    if (half >= first && Math.abs(half * 2 - peak) <= 1 && power[half] > power[peak] * 0.15)
        return fail('Ambiguous fundamental and harmonic', metrics);
    let shift = 0;
    if (power[peak - 1] > EPS && power[peak + 1] > EPS) {
        const a = Math.log(power[peak - 1]), b = Math.log(power[peak]), c = Math.log(power[peak + 1]), den = a - 2 * b + c;
        if (Math.abs(den) > EPS)
            shift = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den));
    }
    const hz = (peak + shift) * binHz;
    if (hz < low || hz > high)
        return fail('Interpolated frequency outside supported band', metrics);
    const lag = Math.round(rate / hz);
    let dot = 0, left = 0, right = 0;
    for (let i = 0; i < n - lag; i++) {
        dot += signal[i] * signal[i + lag];
        left += signal[i] ** 2;
        right += signal[i + lag] ** 2;
    }
    const autocorrelation = dot / Math.sqrt(left * right);
    if (!Number.isFinite(autocorrelation) || autocorrelation < 0.6)
        return fail('Period does not repeat consistently', { ...metrics, autocorrelation: Number.isFinite(autocorrelation) ? autocorrelation : 0 });
    return { hz, reason: null, metrics: { variance: v, binHz, ...metrics, autocorrelation } };
}
