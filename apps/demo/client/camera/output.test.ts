import { expect, it } from 'vitest';
import { makeObservation, vitalLabel } from './output.ts';
import type { FaceTrack } from './tracking.ts';
import type { SignalReading } from './signals/index.ts';
const track: FaceTrack = { id: 'face-1', face: { box: { x: 64, y: 48, w: 128, h: 96 }, descriptor: [], landmarks: [], score: 0.9 }, lastSeen: 0, votes: [], match: { visitId: 'ama', name: 'Ama', score: 0.9 }, identity: 'identified' };
const reading: SignalReading = { hrBpm: 86, hrQuality: 'good', rrBpm: 15, rrQuality: 'fair', posture: null, hint: null, hrSecondsCollected: 12, pulseTrace: [-0.5, 0.5] };
it('preserves real signal samples and replay metadata in normalized observations', () => {
  expect(makeObservation(track, reading, { cam: 'B', source: 'replay', now: 1000, width: 640, height: 480 })).toMatchObject({
    cameraId: 'B', at: 1000, trackId: 'face-1', visitId: 'ama', matchScore: 0.9, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    hrBpm: 86, rrBpm: 15, pulseTrace: [-0.5, 0.5], source: 'replay',
  });
});
it('never sends unknown identities or displays low quality numbers as readings', () => {
  const unknown: FaceTrack = { ...track, match: null, identity: 'unknown' };
  expect(makeObservation(unknown, reading, { cam: 'A', source: 'live', now: 1000, width: 640, height: 480 })).toMatchObject({ visitId: null, matchScore: null, hrBpm: null, hrQuality: 'none', rrBpm: null, pulseTrace: null });
  expect(vitalLabel({ ...reading, hrQuality: 'low', rrQuality: 'low' })).toContain('Low signal');
  expect(vitalLabel({ ...reading, hrBpm: null, hrQuality: 'none', hrSecondsCollected: 7 })).toContain('measuring');
  expect(vitalLabel(reading)).toContain('86 bpm');
});
