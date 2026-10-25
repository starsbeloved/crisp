import { describe, expect, it } from 'vitest';
import { roomDigest } from '../../dashboard/AskCrispVoice.tsx';
import { RoomStore } from '../../../server/store.ts';

describe('nurse room digest', () => {
  it('includes recorded answers and signal quality without descriptors or unsupported readings', () => {
    const { state } = new RoomStore(null);
    state.visits.push({ id: 'ama', name: 'Ama', queueNo: 3, createdAt: 123, faceEnrolled: false, status: 'waiting', calledAt: null, room: null,
      answers: { reason: 'My chest feels tight', reasonChips: [], onset: 'today', trend: 'worse', via: 'voice', followUp: null }, summary: null });
    state.vitals.ama = { visitId: 'ama', lastSeenAt: 123, cameraId: 'A', box: { x: 0, y: 0, w: 1, h: 1 }, hrBpm: 118, hrQuality: 'low', rrBpm: null, rrQuality: 'none', baselineHr: null, baselineRr: null, posture: null, hint: 'hold still', source: 'replay', pulseTrace: null, level: 'none', history: [] };
    const digest = JSON.parse(roomDigest(state, 124));
    expect(digest.visits[0]).toMatchObject({ name: 'Ama', queueNo: 3, answers: { reason: 'My chest feels tight' }, cameraEstimates: { hrBpm: null, hrQuality: 'low', rrBpm: null, source: 'replay', lastSeenAt: 123 } });
    expect(roomDigest(state, 124)).not.toContain('descriptor');
    expect(roomDigest(null)).toContain('unavailable');
  });
  it('labels stale camera estimates instead of presenting old numbers as current', () => {
    const { state } = new RoomStore(null);
    state.visits.push({ id: 'ama', name: 'Ama', queueNo: 3, createdAt: 0, faceEnrolled: false, status: 'waiting', calledAt: null, room: null,
      answers: { reason: 'Headache', reasonChips: [], onset: 'today', trend: 'same', via: 'form', followUp: null }, summary: null });
    state.vitals.ama = { visitId: 'ama', lastSeenAt: 1000, cameraId: 'A', box: { x: 0, y: 0, w: 1, h: 1 }, hrBpm: 80, hrQuality: 'good', rrBpm: 16, rrQuality: 'good', baselineHr: null, baselineRr: null, posture: null, hint: null, source: 'live', pulseTrace: null, level: 'none', history: [] };
    expect(JSON.parse(roomDigest(state, 10000)).visits[0].cameraEstimates).toMatchObject({ stale: true, hrBpm: null, rrBpm: null });
  });
});
