import type { Observation } from '../../shared/types.ts';
import { createSignalTracker, type FaceSample, type SignalReading } from '../camera/signals/index.ts';

export interface KioskPulseSample {
  at: number; bpm: number; quality: 'good' | 'fair'; trace: number[] | null; box: Observation['box'];
}
export interface KioskPulseView {
  reading: SignalReading; secondsLeft: number; elapsed: number; expired: boolean; fps: number; samples: KioskPulseSample[];
}
/** One short acquisition. All timer and RGB timestamps use performance.now(). */
export function createKioskPulse(start: number, wallStart: number) {
  const tracker = createSignalTracker();
  const accepted: KioskPulseSample[] = [];
  let frames: number[] = [], lastSample = -Infinity, lastAccepted = -Infinity;
  let box: Observation['box'] = { x: 0, y: 0, w: 0, h: 0 };
  return {
    push(sample: FaceSample, bounds = box) {
      tracker.pushFace(sample); lastSample = sample.t; box = bounds;
      frames.push(sample.t); frames = frames.filter(t => t >= sample.t - 2000);
    },
    missing() { tracker.reset(); frames = []; lastSample = -Infinity; },
    read(now: number): KioskPulseView {
      const reading = tracker.read(now);
      if (reading.hrBpm !== null && (reading.hrQuality === 'good' || reading.hrQuality === 'fair') && lastSample - lastAccepted >= 1000) {
        accepted.push({ at: wallStart + lastSample - start, bpm: reading.hrBpm, quality: reading.hrQuality,
          trace: reading.pulseTrace, box: { ...box } });
        lastAccepted = lastSample;
      }
      const elapsed = Math.max(0, (now - start) / 1000);
      const recent = frames.filter(t => t >= now - 2000);
      return { reading, elapsed, samples: accepted.slice(), secondsLeft: Math.max(0, Math.ceil(15 - elapsed)), expired: elapsed >= 25,
        fps: recent.length > 1 ? (recent.length - 1) * 1000 / (recent.at(-1)! - recent[0]) : 0 };
    },
    samples: () => accepted.slice(),
  };
}

export function pulseObservations(samples: KioskPulseSample[], visitId: string, replay: boolean): Observation[] {
  return samples.map(sample => ({ cameraId: 'kiosk', trackId: `kiosk-${visitId}`, at: sample.at, visitId,
    matchScore: null, box: sample.box, hrBpm: sample.bpm, hrQuality: sample.quality,
    rrBpm: null, rrQuality: 'none', posture: null, hint: null, pulseTrace: sample.trace, source: replay ? 'replay' : 'live' }));
}

/** Bound the whole upload so an optional pulse cannot stall a saved check-in. */
export async function sharePulse(samples: KioskPulseSample[], visitId: string, replay: boolean) {
  const signal = AbortSignal.timeout(4000);
  for (const observation of pulseObservations(samples, visitId, replay)) {
    const response = await fetch('/api/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observations: [observation] }), signal });
    if (!response.ok) throw new Error('Kiosk pulse upload unavailable');
  }
}
