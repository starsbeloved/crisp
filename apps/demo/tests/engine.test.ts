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

describe('P4 fusion alerts', () => {
  it('does not alert on normal HR and a four-second lean', () => {
    const state = room();
    expect(tick(state, 0, { posture: posture({ slumpSec: 4 }) }).opened).toEqual([]);
    expect(state.vitals.ama.level).toBe('none');
  });

  it('opens amber only after twenty seconds of good high HR and fills the facts', () => {
    const state = room();
    run(state, 0, 19, { hrBpm: 118 });
    expect(state.alerts).toEqual([]);
    const result = tick(state, 20, { hrBpm: 118 });
    run(state, 21, 25, { hrBpm: 118 });
    expect(result.opened).toHaveLength(1);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]).toMatchObject({ visitId: 'ama', cameraId: 'A', level: 'amber', status: 'open',
      openedAt: start + 20_000, updatedAt: start + 20_000, checkedAt: null, acknowledgedAt: null,
      explanation: null, audio: null, replayFrames: 0,
      facts: { name: 'Ama', queueNo: 3, chiefComplaint: 'Chest tightness', answers: state.visits[0].answers,
        hrBpm: 118, baselineHr: 118, rrBpm: 16, baselineRr: 16, hrReason: 'news2-high', rrReason: null,
        postureEvents: [], waitedMin: 2 } });
    expect(state.alerts[0].reasons.join(' ')).toMatch(/Heart rate 118 bpm.*20 s/);
    expect(state.vitals.ama.level).toBe('amber');
  });

  it('detects a sustained change of twenty or more from the measured baseline', () => {
    const state = room();
    run(state, 0, 60, { hrBpm: 80 });
    run(state, 61, 86, { hrBpm: 104 });
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]).toMatchObject({ level: 'amber', facts: { hrReason: 'baseline-delta', baselineHr: 80 } });
  });

  it('upgrades a resting slump alert in place when sustained high HR joins it', () => {
    const state = room();
    const slumped = posture({ slumpSec: 12 });
    const first = tick(state, 0, { hrBpm: 76, posture: slumped }).opened[0];
    expect(first?.level).toBe('amber');
    expect(first?.reasons.join(' ')).toContain('may be resting');
    first.explanation = { bubble: 'Previous explanation', speech: 'Previous speech', source: 'template' };
    first.audio = 'ready';
    first.status = 'acknowledged';
    run(state, 1, 20, { hrBpm: 120, posture: slumped });
    const result = tick(state, 21, { hrBpm: 120, posture: posture({ slumpSec: 33 }) });
    expect(result.opened).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(state.alerts).toHaveLength(1);
    expect(result.updated[0]).toMatchObject({ id: first.id, level: 'red', status: 'acknowledged',
      updatedAt: start + 21_000, explanation: null, audio: null,
      facts: { hrBpm: 120, hrReason: 'news2-high', postureEvents: [{ kind: 'slump', seconds: 33 }] } });
    expect(first.reasons.join(' ')).toContain('Slumped forward 12 s');
    expect(first.reasons.join(' ')).toContain('Slumped forward 33 s');
    expect(state.vitals.ama.level).toBe('red');
    tick(state, 22);
    expect(state.vitals.ama.level).toBe('none');
    expect(first.level).toBe('red');
    expect(first.status).toBe('acknowledged');
  });

  it.each([
    [posture({ headDropSec: 6 }), 'Head below shoulders', 'headDrop', 6],
    [posture({ fallSuspected: true }), 'Fall-like movement detected', 'fall', 0],
  ] as const)('opens red for immediate posture evidence %j', (event, reason, kind, seconds) => {
    const state = room();
    const alert = tick(state, 0, { posture: event }).opened[0];
    expect(alert?.level).toBe('red');
    expect(alert?.reasons.join(' ')).toContain(reason);
    expect(alert?.facts.postureEvents).toEqual([{ kind, seconds }]);
  });

  it('does not count low-quality HR as abnormal; posture still requests a check honestly', () => {
    const state = room();
    run(state, 0, 25, { hrBpm: 130, hrQuality: 'low' });
    expect(state.alerts).toEqual([]);
    const alert = tick(state, 26, { hrBpm: 130, hrQuality: 'low', rrBpm: null, rrQuality: 'none',
      posture: posture({ stillSec: 35 }) }).opened[0];
    expect(alert?.level).toBe('amber');
    expect(alert?.facts.hrReason).toBeNull();
    expect(alert?.reasons.join(' ')).toContain('Heart rate unavailable (low signal)');
    expect(alert?.reasons.join(' ')).not.toContain('heart rate normal');
  });

  it.each([
    [{ hrBpm: 50, hrQuality: 'fair' }, 'hrReason', 'news2-low'],
    [{ rrBpm: 25, rrQuality: 'fair' }, 'rrReason', 'news2-high'],
    [{ rrBpm: 8, rrQuality: 'good' }, 'rrReason', 'news2-low'],
  ] as const)('uses inclusive low HR and RR bands with fair or good quality: %j', (patch, field, reason) => {
    const state = room();
    run(state, 0, 19, patch);
    expect(state.alerts).toEqual([]);
    tick(state, 20, patch);
    expect(state.alerts[0]?.level).toBe('amber');
    expect(state.alerts[0]?.facts[field]).toBe(reason);
  });

  it('fuses abnormal breathing with stillness into red', () => {
    const state = room();
    run(state, 0, 20, { rrBpm: 26, posture: posture({ stillSec: 35 }) });
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]).toMatchObject({ level: 'red', facts: { rrReason: 'news2-high' } });
  });

  it('tolerates a three-second sampling gap, but restarts after a longer gap or normal reading', () => {
    const state = room();
    run(state, 0, 10, { hrBpm: 118 });
    run(state, 13, 20, { hrBpm: 118 });
    expect(state.alerts[0]?.level).toBe('amber');
    const interrupted = room();
    run(interrupted, 0, 10, { hrBpm: 118 });
    run(interrupted, 14, 33, { hrBpm: 118 });
    expect(interrupted.alerts).toEqual([]);
    tick(interrupted, 34, { hrBpm: 118 });
    expect(interrupted.alerts).toHaveLength(1);
    const normal = room();
    run(normal, 0, 19, { hrBpm: 118 });
    tick(normal, 20);
    run(normal, 21, 40, { hrBpm: 118 });
    expect(normal.alerts).toEqual([]);
  });

  it('resets baselines and posture on checked, suppresses sixty seconds, then opens a new episode', () => {
    const state = room();
    run(state, 0, 10);
    const first = tick(state, 11, { posture: posture({ fallSuspected: true }) }).opened[0];
    onChecked(state, first, start + 12_000);
    expect(first).toMatchObject({ status: 'checked', checkedAt: start + 12_000, updatedAt: start + 12_000 });
    expect(state.vitals.ama).toMatchObject({ baselineHr: null, baselineRr: null, level: 'none', posture: null });
    run(state, 13, 71, { hrBpm: 118, posture: posture({ fallSuspected: true }) });
    expect(state.alerts).toHaveLength(1);
    expect(state.vitals.ama.level).toBe('none');
    const result = tick(state, 72, { hrBpm: 118, posture: posture({ fallSuspected: true }) });
    expect(result.opened).toHaveLength(1);
    expect(result.opened[0].id).not.toBe(first.id);
    expect(state.alerts).toHaveLength(2);
  });
});
