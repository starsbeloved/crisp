import { describe, expect, it } from 'vitest';
import { ingest, onChecked } from '../server/engine/index.ts';
import type { Observation, PostureState, RoomState, Visit } from '../shared/types.ts';

const start = 1_000_000;
function room(): RoomState {
  const visit: Visit = {
    id: 'ama', queueNo: 3, name: 'Ama', createdAt: start - 120_000, faceEnrolled: true,
    answers: { reason: 'Chest feels tight', reasonChips: [], onset: 'today', trend: 'worse',
      followUp: { question: 'When?', answer: 'This morning' }, via: 'form' },
    summary: { chiefComplaint: 'Chest tightness', text: 'Chest tightness getting worse.', source: 'template' },
    status: 'waiting', calledAt: null, room: null,
  };
  return { serverNow: start, visits: [visit], vitals: {}, alerts: [], cameras: {}, nowCalling: null,
    handoffs: {}, references: [], providers: { gemini: false, elevenlabs: false, agent: false } };
}
function observation(at: number, patch: Partial<Observation> = {}): Observation {
  return { cameraId: 'A', trackId: 'face-1', at, visitId: 'ama', matchScore: 0.94,
    box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, hrBpm: 75, hrQuality: 'good',
    rrBpm: 16, rrQuality: 'good', posture: null, hint: null, pulseTrace: [0.2, -0.2], source: 'live', ...patch };
}
function tick(state: RoomState, seconds: number, patch: Partial<Observation> = {}) {
  const now = start + seconds * 1000;
  return ingest(state, [observation(now, patch)], now);
}
function run(state: RoomState, from: number, to: number, patch: Partial<Observation> = {}) {
  for (let seconds = from; seconds <= to; seconds++) tick(state, seconds, patch);
}
const posture = (patch: Partial<PostureState>): PostureState =>
  ({ slumpSec: 0, headDropSec: 0, stillSec: 0, fallSuspected: false, ...patch });

describe('P4 vitals and baselines', () => {
  it('selects the best HR quality, then newest camera, and copies its evidence', () => {
    const state = room();
    const best = observation(start + 100, { cameraId: 'B', hrQuality: 'good', hint: 'hold still', source: 'replay' });
    ingest(state, [best, observation(start + 200, { hrQuality: 'low' }), observation(start, { hrQuality: 'good' })], start + 200);
    expect(state.vitals.ama).toMatchObject({ cameraId: 'B', lastSeenAt: start + 100,
      box: best.box, pulseTrace: [0.2, -0.2], hint: 'hold still', source: 'replay', level: 'none' });
    expect(state.vitals.ama.history).toHaveLength(1);
  });

  it('needs ten good readings and uses their median for both baselines', () => {
    const state = room();
    run(state, 0, 8, { hrBpm: 80, rrBpm: 14 });
    expect(state.vitals.ama.baselineHr).toBeNull();
    tick(state, 9, { hrBpm: 100, rrBpm: 20 });
    expect(state.vitals.ama).toMatchObject({ baselineHr: 80, baselineRr: 14 });
  });

  it('finishes sparse baseline collection after sixty seconds and then freezes it', () => {
    const state = room();
    run(state, 0, 8, { hrBpm: 80, rrBpm: 14 });
    run(state, 9, 70, { hrQuality: 'low', rrQuality: 'fair' });
    expect(state.vitals.ama).toMatchObject({ baselineHr: null, baselineRr: null });
    tick(state, 71, { hrBpm: 100, rrBpm: 20 });
    run(state, 72, 100, { hrBpm: 100, rrBpm: 20 });
    expect(state.vitals.ama).toMatchObject({ baselineHr: 80, baselineRr: 14 });
  });

  it('records at most one history and baseline sample per second and retains ten minutes', () => {
    const state = room();
    for (let ms = 0; ms < 1000; ms += 50) ingest(state, [observation(start + ms)], start + ms);
    expect(state.vitals.ama.history).toHaveLength(1);
    expect(state.vitals.ama.baselineHr).toBeNull();
    tick(state, 601, { hrBpm: null, rrBpm: null, hrQuality: 'none', rrQuality: 'none' });
    expect(state.vitals.ama.history).toEqual([{ t: start + 601_000, hr: null, rr: null }]);
  });

  it('ignores unknown, missing, and called visits', () => {
    const state = room();
    state.visits[0].status = 'called';
    const result = ingest(state, [observation(start), observation(start, { visitId: null }),
      observation(start, { visitId: 'unknown' })], start);
    expect(state.vitals).toEqual({});
    expect(result).toEqual({ opened: [], updated: [] });
  });
});
