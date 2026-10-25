import { describe, expect, it } from 'vitest';
import { createKioskPulse, pulseObservations } from '../pulse.ts';

const sample = (t: number) => {
  const wave = Math.sin(2 * Math.PI * 1.2 * t / 1000);
  return { t, rgb: [120 + .3 * wave, 100 + 1.5 * wave, 80 + .1 * wave] as [number, number, number], brightness: 104, faceWidthPx: 180 };
};
function feed(session: ReturnType<typeof createKioskPulse>, end = 15_000) {
  for (let t = 0; t <= end; t += 40) { session.push(sample(t)); session.read(t); }
}
describe('kiosk pulse current evidence', () => {
  it('collects real 1 Hz estimates from 10 s, exposes quality, SNR and a waveform', () => {
    const session = createKioskPulse(0, 100_000); feed(session);
    const view = session.read(15_000);
    expect(view.reading.hrBpm).toBeCloseTo(72, 0);
    expect(view.reading.hrQuality).toBe('good');
    expect(view.reading.hrSnr).toBeGreaterThan(2);
    expect(view.reading.pulseTrace).toHaveLength(60);
    expect(view.fps).toBeCloseTo(25);
    expect(view.secondsLeft).toBe(0);
    const observations = pulseObservations(session.samples(), 'visit-1', false);
    expect(observations.length).toBeGreaterThanOrEqual(5);
    expect(observations[0]).toMatchObject({ visitId: 'visit-1', cameraId: 'kiosk', source: 'live', at: 110_000, rrBpm: null, posture: null, matchScore: null });
    expect(observations.every((o, i) => i === 0 || o.at - observations[i - 1].at >= 1000)).toBe(true);
    expect(pulseObservations(session.samples(), 'visit-2', true).every(o => o.source === 'replay')).toBe(true);
  });
  it('withholds the number immediately on cover and dark frames; recollects after cover', () => {
    const session = createKioskPulse(0, 100_000); feed(session);
    session.missing();
    expect(session.read(15_040).reading.hrBpm).toBeNull();
    session.push(sample(15_080));
    expect(session.read(15_080).reading.hrBpm).toBeNull();
    const dark = createKioskPulse(0, 100_000);
    for (let t = 0; t <= 15_000; t += 40) dark.push({ ...sample(t), brightness: 30 });
    expect(dark.read(15_000).reading.hrBpm).toBeNull();
    expect(dark.read(15_000).reading.hint).toBe('too dark');
    expect(dark.samples()).toHaveLength(0);
  });
  it('never invents an estimate from flat pixels and times out at 25 seconds', () => {
    const session = createKioskPulse(0, 100_000);
    for (let t = 0; t <= 25_000; t += 40) { session.push({ ...sample(t), rgb: [120, 100, 80] }); session.read(t); }
    expect(session.read(24_999).expired).toBe(false);
    expect(session.read(25_000).expired).toBe(true);
    expect(session.read(25_000).reading.hrBpm).toBeNull();
    expect(session.samples()).toHaveLength(0);
  });
});
