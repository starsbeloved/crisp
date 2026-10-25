import { describe, expect, it } from 'vitest';
import { createSignalTracker, type FaceSample, type SignalTracker } from '../client/camera/signals/index.ts';

function random(seed = 27) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function face(t: number, bpm = 72, noise = 0, rng = random()): FaceSample {
  const pulse = Math.sin(2 * Math.PI * bpm / 60 * t / 1000);
  return { t, rgb: [120 + 0.35 * pulse + noise * (rng() - 0.5),
    100 + 1.2 * pulse + noise * (rng() - 0.5), 80 + 0.1 * pulse + noise * (rng() - 0.5)],
    brightness: 100, faceWidthPx: 150 };
}

function collect(tracker: SignalTracker, start: number, end: number, bpm = 72, jitter = false,
  change: (s: FaceSample, i: number) => FaceSample = s => s) {
  const rng = random();
  let t = start, i = 0, lastRead = start;
  for (; t <= end; t += jitter ? 1000 / (20 + rng() * 10) : 1000 / 30) {
    tracker.pushFace(change(face(t, bpm, 0.16, rng), i++));
    if (t - lastRead >= 1000) { tracker.read(t); lastRead = t; }
  }
  tracker.pushFace(change(face(end, bpm, 0.16, rng), i));
  return tracker.read(end);
}

describe('P3 camera heart rate', () => {
  it.each([72, 110])('measures noisy %i bpm with irregular 20–30 fps timing', bpm => {
    const reading = collect(createSignalTracker(), 0, 15_000, bpm, true);
    expect(reading.hrBpm).not.toBeNull();
    expect(Math.abs(reading.hrBpm! - bpm)).toBeLessThanOrEqual(3);
    expect(['good', 'fair']).toContain(reading.hrQuality);
  });

  it('collects for ten seconds before returning an estimate', () => {
    const tracker = createSignalTracker();
    const collecting = collect(tracker, 0, 7000);
    expect(collecting.hrBpm).toBeNull();
    expect(collecting.hrSecondsCollected).toBeCloseTo(7, 1);
    expect(collect(tracker, 7034, 10_100).hrBpm).toBeCloseTo(72, 0);
  });

  it('returns an actual normalized waveform after five seconds', () => {
    const tracker = createSignalTracker();
    expect(collect(tracker, 0, 4900).pulseTrace).toBeNull();
    expect(collect(tracker, 4934, 5500).pulseTrace).toHaveLength(60);
    const reading = collect(tracker, 5534, 15_000);
    expect(reading.pulseTrace).toHaveLength(60);
    expect(Math.max(...reading.pulseTrace!)).toBeGreaterThan(0.5);
    expect(Math.min(...reading.pulseTrace!)).toBeLessThan(-0.5);
    expect(reading.pulseTrace!.every(x => Number.isFinite(x) && Math.abs(x) <= 1)).toBe(true);
    // Six seconds at 72 bpm has roughly seven cycles, independently of normalization.
    const crossings = reading.pulseTrace!.slice(1).filter((x, i) => x > 0 && reading.pulseTrace![i] <= 0).length;
    expect(crossings).toBeGreaterThanOrEqual(6);
    expect(crossings).toBeLessThanOrEqual(8);
  });

  it('does not turn flat RGB into a pulse', () => {
    const reading = collect(createSignalTracker(), 0, 15_000, 72, false,
      s => ({ ...s, rgb: [120, 100, 80] }));
    expect(reading).toMatchObject({ hrBpm: null, hrQuality: 'low', pulseTrace: null });
  });

  it('interpolates isolated RGB glitches without losing the pulse', () => {
    const reading = collect(createSignalTracker(), 0, 15_000, 110, true,
      (s, i) => i % 47 === 10 ? { ...s, rgb: [240, 230, 220] } : s);
    expect(reading.hrBpm).not.toBeNull();
    expect(Math.abs(reading.hrBpm! - 110)).toBeLessThanOrEqual(3);
  });

  it('rejects a window with more than twenty percent unusable samples', () => {
    const reading = collect(createSignalTracker(), 0, 15_000, 72, false,
      (s, i) => i % 3 === 0 ? { ...s, rgb: [NaN, 0, 0] } : s);
    expect(reading).toMatchObject({ hrBpm: null, hrQuality: 'low', pulseTrace: null });
  });

  it('forgets readings across a ten-second gap and resumes only after collecting again', () => {
    const tracker = createSignalTracker();
    expect(collect(tracker, 0, 15_000).hrBpm).not.toBeNull();
    expect(tracker.read(25_000)).toMatchObject({ hrBpm: null, hrQuality: 'low', pulseTrace: null });
    expect(collect(tracker, 25_000, 32_000, 110)).toMatchObject({ hrBpm: null });
    const resumed = collect(tracker, 32_034, 36_000, 110);
    expect(resumed.hrBpm).not.toBeNull();
    expect(Math.abs(resumed.hrBpm! - 110)).toBeLessThanOrEqual(3);
  });

  it('clears outputs and buffers on reset', () => {
    const tracker = createSignalTracker();
    collect(tracker, 0, 15_000);
    tracker.reset();
    expect(tracker.read(15_000)).toMatchObject({ hrBpm: null, hrQuality: 'none',
      rrBpm: null, posture: null, pulseTrace: null, hrSecondsCollected: 0 });
  });

  it.each([
    [{ brightness: 30 }, 'too dark'], [{ faceWidthPx: 60 }, 'move closer'],
  ] as const)('withholds estimates and coaches unusable face samples %j', (change, hint) => {
    const tracker = createSignalTracker();
    collect(tracker, 0, 15_000);
    tracker.pushFace({ ...face(15_034), ...change });
    expect(tracker.read(15_034)).toMatchObject({ hrBpm: null, hrQuality: 'low', pulseTrace: null, hint });
  });

  it('coaches rapid face scale motion', () => {
    const tracker = createSignalTracker();
    tracker.pushFace(face(0));
    tracker.pushFace({ ...face(34), faceWidthPx: 190 });
    expect(tracker.read(34).hint).toBe('hold still');
  });

  it.each([12, 240])('rejects a dominant %i bpm color oscillation outside the heart-rate band', bpm => {
    const result = collect(createSignalTracker(), 0, 15_000, bpm);
    expect(result).toMatchObject({ hrBpm: null, hrQuality: 'low', pulseTrace: null });
  });

  it('does not reconstruct a heart rate from samples below Nyquist cadence', () => {
    const tracker = createSignalTracker();
    for (let t = 0; t <= 15_000; t += 250) tracker.pushFace(face(t, 110));
    expect(tracker.read(15_000)).toMatchObject({ hrBpm: null, hrQuality: 'low', pulseTrace: null });
  });

  it('publishes heart rate with irregular read timing after ten seconds', () => {
    const tracker = createSignalTracker();
    collect(tracker, 0, 9800, 72);
    collect(tracker, 9834, 10_200, 72);
    expect(tracker.read(10_200).hrBpm).not.toBeNull();
    expect(tracker.read(10_200).hrSecondsCollected).toBe(10);
  });

  it('requires three seconds of consistent evidence for a large jump across a low-quality transition', () => {
    const tracker = createSignalTracker();
    const readings = new Map<number, number | null>();
    for (let t = 0; t <= 30_000; t += 40) {
      const cycles = t < 20_000 ? 1.2 * t / 1000 : 24 + 110 / 60 * (t - 20_000) / 1000;
      const p = Math.sin(2 * Math.PI * cycles);
      tracker.pushFace({ t, rgb: [120 + 0.35 * p, 100 + 1.2 * p, 80 + 0.1 * p], brightness: 100, faceWidthPx: 150 });
      if (t >= 10_000 && t % 1000 === 0) readings.set(t, tracker.read(t).hrBpm);
    }
    expect(readings.get(20_000)).toBeCloseTo(72, 0);
    expect(readings.get(26_000)).toBeNull();
    expect(readings.get(28_000)).toBeNull();
    expect(readings.get(30_000)).toBeCloseTo(110, 0);
  });
});
