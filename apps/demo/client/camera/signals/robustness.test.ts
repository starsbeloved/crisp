import { describe, expect, it } from 'vitest';
import { createSignalTracker, signalDisplayLabel, type FaceSample, type PoseSample } from './index.ts';
import { cheekPatches, meanCheekSample } from '../sampling.ts';
import { makeObservation } from '../output.ts';
import type { DetectedFace } from '../../lib/face.ts';

function face(t: number): FaceSample {
  const p = Math.sin(2 * Math.PI * 1.2 * t / 1000);
  return { t, rgb: [120 + 0.35 * p, 100 + 1.2 * p, 80 + 0.1 * p], brightness: 100, faceWidthPx: 150 };
}
function pulseTracker() {
  const tracker = createSignalTracker();
  for (let t = 0; t <= 15_000; t += 40) {
    tracker.pushFace(face(t));
    if (t % 1000 === 0) tracker.read(t);
  }
  return tracker;
}

describe('P13d display evidence stays separate from current HR', () => {
  it('retains a timestamped estimate during a dark frame without publishing it as current', () => {
    const tracker = pulseTracker();
    tracker.pushFace({ ...face(15_040), brightness: 30 });
    const reading = tracker.read(15_040);
    expect(reading).toMatchObject({ hrBpm: null, hrQuality: 'low', pulseTrace: null });
    expect(reading.hrDisplay).toMatchObject({ bpm: expect.closeTo(72, 0), quality: 'good', retained: true, ageSeconds: 0 });
    expect(reading.hrDisplay?.label).toContain('last good reading · 0 s ago');
    const observation = makeObservation({ id: 'synthetic-face', face: detectedFace(), lastSeen: 15_040,
      votes: [], match: { visitId: 'synthetic-visit', name: 'Fictional volunteer', score: 1 }, identity: 'identified' },
    reading, { cam: 'P13D', source: 'replay', now: 15_040, width: 100, height: 100 });
    expect(observation).toMatchObject({ hrBpm: null, hrQuality: 'low', source: 'replay' });
    expect(observation).not.toHaveProperty('hrDisplay');
    expect(signalDisplayLabel(reading)).toContain('last good reading · 0 s ago');
    expect(signalDisplayLabel(reading)).toContain('Breathing: not measured');
  });

  it('drops display quality after three seconds and expires the value after thirty', () => {
    const tracker = pulseTracker();
    tracker.read(16_040);
    expect(tracker.read(19_039).hrDisplay?.quality).toBe('good');
    expect(tracker.read(19_040).hrDisplay).toMatchObject({ quality: 'low', retained: true });
    expect(tracker.read(27_000).hrDisplay?.label).toContain('last good reading · 12 s ago');
    expect(tracker.read(45_000).hrDisplay?.bpm).not.toBeNull();
    expect(tracker.read(45_001).hrDisplay).toMatchObject({ bpm: null, quality: 'low', label: 'Low signal' });
  });

  it('does not refresh the retained timestamp merely because read is called again', () => {
    const tracker = pulseTracker();
    tracker.read(15_900);
    expect(tracker.read(27_000).hrDisplay?.ageSeconds).toBe(12);
    tracker.reset();
    expect(tracker.read(27_000).hrDisplay).toMatchObject({ bpm: null, quality: 'none', label: 'measuring…' });
  });

  it('requires three continuous seconds to recover display quality after a dropout', () => {
    const tracker = pulseTracker();
    tracker.read(17_000); tracker.read(20_000);
    for (let t = 20_040; t <= 33_040; t += 40) {
      tracker.pushFace(face(t));
      tracker.read(t);
      if (t === 30_040 || t === 33_000) expect(tracker.read(t).hrDisplay?.quality).toBe('low');
    }
    expect(tracker.read(33_040).hrDisplay?.quality).toBe('good');
    expect(tracker.read(33_040).hrBpm).toBeCloseTo(72, 0);
  });

  it('does not let brief low-quality flicker drop the stable display quality', () => {
    const tracker = pulseTracker();
    tracker.pushFace({ ...face(15_040), brightness: 30 }); tracker.read(15_040);
    for (let t = 15_080; t <= 17_000; t += 40) { tracker.pushFace(face(t)); tracker.read(t); }
    expect(tracker.read(17_000).hrDisplay?.quality).toBe('good');
  });

  it('labels initial collection and usable breathing without fabricating values', () => {
    const reading = createSignalTracker().read(0);
    expect(signalDisplayLabel(reading)).toBe('♥ measuring… · Breathing: not measured');
    expect(signalDisplayLabel({ ...reading, rrBpm: 15, rrQuality: 'fair' })).toContain('Breathing: 15/min · fair');
  });
});

function detectedFace(): DetectedFace {
  const landmarks = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
  Object.assign(landmarks, { 19: { x: 30, y: 32 }, 24: { x: 70, y: 32 },
    36: { x: 25, y: 40 }, 45: { x: 75, y: 40 }, 31: { x: 44, y: 60 },
    35: { x: 56, y: 60 }, 33: { x: 50, y: 65 }, 48: { x: 38, y: 80 }, 54: { x: 62, y: 80 } });
  return { box: { x: 10, y: 10, w: 80, h: 80 }, score: 1, descriptor: [], landmarks };
}

describe('P13d cheek and forehead sampling', () => {
  it('adds a bounded forehead patch above the brows', () => {
    const f = detectedFace(), patches = cheekPatches(f);
    expect(patches).toHaveLength(3);
    expect(patches[2].y + patches[2].h).toBeLessThan(f.landmarks[19].y);
    for (const p of patches) {
      expect(p.x).toBeGreaterThanOrEqual(10); expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.x + p.w).toBeLessThanOrEqual(90); expect(p.y + p.h).toBeLessThanOrEqual(90);
    }
  });

  it('actually includes forehead pixels in the RGB average', () => {
    const data = new Uint8ClampedArray(100 * 100 * 4);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      const i = (y * 100 + x) * 4;
      data[i] = y < 32 ? 200 : 100; data[i + 1] = 100; data[i + 2] = 80; data[i + 3] = 255;
    }
    const sample = meanCheekSample({ data, width: 100, height: 100 }, detectedFace(), 100, 100, 10, 200);
    expect(sample!.rgb[0]).toBeGreaterThan(100);
    expect(sample!.rgb[0]).toBeLessThan(200);
    expect(sample!.rgb.slice(1)).toEqual([100, 80]);
    expect(sample!.faceWidthPx).toBe(160);
  });

  it('rejects invalid detection dimensions and malformed landmarks', () => {
    const pixels = { data: new Uint8ClampedArray(100 * 100 * 4), width: 100, height: 100 };
    expect(meanCheekSample(pixels, detectedFace(), 0, 100, 0, 100)).toBeNull();
    const f = detectedFace(); f.landmarks[19].y = NaN;
    expect(cheekPatches(f).every(p => Object.values(p).every(Number.isFinite))).toBe(true);
  });
});

function pose(t: number, lateral = 0, visible = true): PoseSample {
  const y = 0.002 * Math.sin(2 * Math.PI * 0.25 * t / 1000);
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.2, z: 0, visibility: 1 }));
  landmarks[11] = { x: 0.4 + lateral, y: 0.4 + y, z: 0, visibility: visible ? 1 : 0.1 };
  landmarks[12] = { x: 0.6 + lateral, y: 0.4 + y, z: 0, visibility: visible ? 1 : 0.1 };
  landmarks[23] = { x: 0.43, y: 0.7, z: 0, visibility: 1 };
  landmarks[24] = { x: 0.57, y: 0.7, z: 0, visibility: 1 };
  return { t, landmarks };
}

describe('P13d breathing requires still visible shoulders', () => {
  it('withholds a plausible respiratory peak during shoulder sway', () => {
    const tracker = createSignalTracker();
    for (let t = 0; t <= 35_000; t += 40) {
      // Shoulder motion is diluted by the five-point whole-body motion mean in the old gate.
      tracker.pushPose(pose(t, 0.02 * Math.sin(2 * Math.PI * 1.5 * t / 1000)));
      if (t % 1000 === 0) tracker.read(t);
    }
    expect(tracker.read(35_000)).toMatchObject({ rrBpm: null });
  });

  it('clears a measured rate immediately when a shoulder disappears', () => {
    const tracker = createSignalTracker();
    for (let t = 0; t <= 35_000; t += 40) tracker.pushPose(pose(t));
    expect(tracker.read(35_000).rrBpm).toBeCloseTo(15, 0);
    tracker.pushPose(pose(35_040, 0, false));
    expect(tracker.read(35_040)).toMatchObject({ rrBpm: null, rrQuality: 'low' });
  });
});
