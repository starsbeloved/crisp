/** Pure numerical helpers adapted from the earlier sensing DSP. Times are milliseconds. */
export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
export function median(a: number[]): number {
  const b = [...a].sort((x, y) => x - y), mid = Math.floor(b.length / 2);
  return b.length ? b.length % 2 ? b[mid] : (b[mid - 1] + b[mid]) / 2 : 0;
}
export const variance = (a: number[]) => { const m = mean(a); return mean(a.map(x => (x - m) ** 2)); };

export function detrend(a: number[]): number[] {
  const m = mean(a), mid = (a.length - 1) / 2;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < a.length; i++) {
    numerator += (i - mid) * (a[i] - m);
    denominator += (i - mid) ** 2;
  }
  return a.map((x, i) => x - m - (denominator ? numerator / denominator : 0) * (i - mid));
}

export function resample<T extends { t: number }>(samples: T[], rate: number, get: (s: T) => number): number[] {
  const first = samples[0].t, last = samples.at(-1)!.t;
  let j = 0;
  return Array.from({ length: Math.floor((last - first) * rate / 1000) + 1 }, (_, i) => {
    const t = first + i * 1000 / rate;
    while (j + 1 < samples.length - 1 && samples[j + 1].t < t) j++;
    const a = samples[j], b = samples[j + 1];
    return get(a) + (get(b) - get(a)) * (t - a.t) / (b.t - a.t);
  });
}

/** Radix-2 FFT, with zero padding for interpolated spectral peaks. */
function fft(values: number[]): { re: number[]; im: number[] } {
  let n = 1;
  while (n < values.length * 4) n *= 2;
  const re = Array<number>(n).fill(0), im = Array<number>(n).fill(0);
  re.splice(0, values.length, ...values);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = -2 * Math.PI / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < size / 2; j++) {
        const c = Math.cos(angle * j), s = Math.sin(angle * j), a = start + j, b = a + size / 2;
        const r = re[b] * c - im[b] * s, v = re[b] * s + im[b] * c;
        re[b] = re[a] - r; im[b] = im[a] - v;
        re[a] += r; im[a] += v;
      }
    }
  }
  return { re, im };
}

export interface Spectrum { hz: number | null; ratio: number }
/** Peak-lobe power / remaining in-band power; prototype thresholds, not clinical confidence. */
export function spectrum(values: number[], rate: number, low: number, high: number): Spectrum {
  const signal = detrend(values), n = signal.length;
  if (n < 8 || !signal.every(Number.isFinite) || variance(signal) < 1e-12) return { hz: null, ratio: 0 };
  const { re, im } = fft(signal.map((x, i) => x * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)))));
  const power = re.map((x, i) => x * x + im[i] * im[i]), bin = rate / re.length;
  const first = Math.ceil(low / bin), last = Math.floor(high / bin);
  let peak = first;
  for (let i = first + 1; i <= last; i++) if (power[i] > power[peak]) peak = i;
  // Include the Hann main lobe. Zero padding adds resolution, not independent evidence.
  const radius = Math.max(1, Math.ceil(1.5 * rate / n / bin));
  let peakPower = 0, rest = 0;
  for (let i = first; i <= last; i++) {
    if (Math.abs(i - peak) <= radius) peakPower += power[i]; else rest += power[i];
  }
  const a = Math.log(Math.max(power[peak - 1], 1e-30));
  const b = Math.log(Math.max(power[peak], 1e-30));
  const c = Math.log(Math.max(power[peak + 1], 1e-30));
  const denominator = a - 2 * b + c;
  const shift = denominator ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / denominator)) : 0;
  return { hz: Math.max(low, Math.min(high, (peak + shift) * bin)), ratio: peakPower / Math.max(rest, 1e-30) };
}

/** Symmetric windowed-sinc FIR; reflected edges avoid zero-padding spikes in the display trace. */
export function bandpass(values: number[], rate: number, low: number, high: number): number[] {
  const signal = detrend(values), half = 45;
  const sinc = (f: number, k: number) => k === 0 ? 2 * f / rate : Math.sin(2 * Math.PI * f / rate * k) / (Math.PI * k);
  const taps = Array.from({ length: half * 2 + 1 }, (_, i) => {
    const k = i - half;
    return (sinc(high, k) - sinc(low, k)) * (0.54 + 0.46 * Math.cos(Math.PI * k / half));
  });
  return signal.map((_, i) => taps.reduce((sum, tap, j) => {
    let index = i + j - half;
    if (index < 0) index = -index;
    if (index >= signal.length) index = 2 * signal.length - 2 - index;
    return sum + tap * signal[index];
  }, 0));
}
