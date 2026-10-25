import type { FaceSample } from './index.ts';
import { bandpass, mean, median, resample, spectrum, variance } from './dsp.ts';
import type { Quality } from '../../../shared/types.ts';

// Final prototype gates: good >= 2, fair >= 1, low otherwise. See README.md.
export const qualityForRatio = (ratio: number): Quality => ratio >= 2 ? 'good' : ratio >= 1 ? 'fair' : 'low';
export const validFace = (s: FaceSample) => Number.isFinite(s.brightness) && s.brightness >= 50 &&
  Number.isFinite(s.faceWidthPx) && s.faceWidthPx >= 90 && s.rgb.every(x => Number.isFinite(x) && x > 0 && x < 255);

function clean(samples: FaceSample[]): FaceSample[] | null {
  const bad = samples.map(s => !validFace(s));
  for (let channel = 0; channel < 3; channel++) {
    const deltas = samples.slice(1).flatMap((s, i) => !bad[i] && !bad[i + 1]
      ? [Math.abs(s.rgb[channel] - samples[i].rgb[channel])] : []);
    // A robust sigma prevents an isolated exposure glitch from setting its own rejection threshold.
    const sigma = Math.max(median(deltas) / 0.6745, 1e-5);
    for (let i = 1; i < samples.length - 1; i++) {
      const local = median(samples.slice(Math.max(0, i - 2), i + 3).map(s => s.rgb[channel]).filter(Number.isFinite));
      if (Math.abs(samples[i].rgb[channel] - local) > 4 * sigma) bad[i] = true;
    }
  }
  if (bad.filter(Boolean).length / samples.length > 0.2) return null;
  const good = samples.filter((_, i) => !bad[i]);
  if (good.length < 2 || good[0].t - samples[0].t > 200 || samples.at(-1)!.t - good.at(-1)!.t > 200) return null;
  if (good.some((s, i) => i > 0 && s.t - good[i - 1].t > 500)) return null;
  return good;
}

/** POS projections and overlap-add, copied/adapted from the earlier rPPG implementation. */
export function estimatePulse(samples: FaceSample[]): { bpm: number | null; quality: Quality; trace: number[] | null; snr?: number } {
  const reject = () => ({ bpm: null, quality: 'low' as const, trace: null });
  const duration = samples.at(-1)!.t - samples[0].t;
  if ((samples.length - 1) * 1000 / duration < 10) return reject();
  const good = clean(samples);
  if (!good) return reject();
  const rgb = [0, 1, 2].map(c => resample(good, 30, s => s.rgb[c]));
  const n = rgb[0].length, signal = Array<number>(n).fill(0), weights = Array<number>(n).fill(0), win = 48;
  for (let end = win; end <= n; end++) {
    const start = end - win;
    const C = rgb.map(a => { const w = a.slice(start, end), m = mean(w); return w.map(x => x / m); });
    const s1 = C[1].map((g, i) => g - C[2][i]);
    const s2 = C[1].map((g, i) => g + C[2][i] - 2 * C[0][i]);
    const v1 = variance(s1), v2 = variance(s2);
    if (v1 < 1e-14 || v2 < 1e-14) continue;
    const alpha = Math.sqrt(v1 / v2), h = s1.map((x, i) => x + alpha * s2[i]), m = mean(h);
    for (let i = 0; i < win; i++) { signal[start + i] += h[i] - m; weights[start + i]++; }
  }
  if (weights.filter(x => x > 0).length < n * 0.8) return reject();
  const pos = signal.map((x, i) => weights[i] ? x / weights[i] : 0);
  const peak = spectrum(pos, 30, 0.7, 3), quality = qualityForRatio(peak.ratio);
  if (quality === 'low' || peak.hz === null) return reject();
  const filtered = bandpass(pos, 30, 0.7, 3).slice(-180);
  const scale = Math.max(...filtered.map(Math.abs));
  const trace = scale > 1e-9 ? Array.from({ length: 60 }, (_, i) => {
    const index = i * (filtered.length - 1) / 59, left = Math.floor(index), right = Math.min(left + 1, filtered.length - 1);
    return (filtered[left] + (filtered[right] - filtered[left]) * (index - left)) / scale;
  }) : null;
  return { bpm: peak.hz * 60, quality, trace, snr: peak.ratio };
}
