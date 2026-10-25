import { describe, expect, it } from 'vitest';
import { ingest } from './index.ts';
import { FaceTracker, BodyTracker } from '../../client/camera/tracking.ts';
import { createSignalTracker, type PoseSample } from '../../client/camera/signals/index.ts';
import { makeObservation } from '../../client/camera/output.ts';
import type { RoomState, Visit } from '../../shared/types.ts';

function room(): RoomState {
  const visits: Visit[] = ['jason-3', 'jason-4'].map((id, i) => ({ id, queueNo: i + 3, name: 'Jason', createdAt: 0,
    faceEnrolled: true, answers: { reason: 'Synthetic test', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' },
    summary: null, status: 'waiting', calledAt: null, room: null }));
  return { serverNow: 0, visits, vitals: {}, alerts: [], cameras: {}, nowCalling: null, handoffs: {}, references: [],
    providers: { gemini: false, elevenlabs: false, agent: false } };
}
function pose(x: number, head: number): PoseSample['landmarks'] {
  const p = Array.from({ length: 33 }, () => ({ x, y: head, z: 0, visibility: .9 }));
  p[11] = { ...p[0], x: x - .08, y: .4 }; p[12] = { ...p[0], x: x + .08, y: .4 };
  p[23] = { ...p[0], x: x - .06, y: .7 }; p[24] = { ...p[0], x: x + .06, y: .7 };
  return p;
}
describe('camera to engine with hidden faces', () => {
  it.each([[200, 'red'], [4000, 'none']] as const)('classifies a %s ms descent as %s with no fabricated vitals', (duration, expected) => {
    const state = room(), bodies = new BodyTracker(), faces = new FaceTracker(), signal = createSignalTracker();
    const gallery = [{ visitId: 'jason-3', name: 'Jason', descriptor: [0, 0] }];
    for (let t = 0; t <= 200; t += 100) faces.update([{ box: { x: 162, y: 70, w: 60, h: 70 },
      score: .95, descriptor: [0, 0], landmarks: [] }], gallery, t);
    for (let t = 200; t <= 4400 + duration; t += 100) {
      const shift = t <= 4400 ? 0 : .22 * (t - 4400) / duration;
      const p = pose(.3, .2).map(point => ({ ...point, y: point.y + shift }));
      bodies.update([p], t === 200 ? faces.current(200) : [], gallery, t, 640, 480);
      const track = bodies.current(t)[0];
      expect(track.match?.visitId).toBe('jason-3');
      signal.pushPose({ t, landmarks: track.pose });
      ingest(state, [makeObservation(track, signal.read(t), { cam: 'A', source: 'replay', now: 100_000 + t, width: 640, height: 480 })], 100_000 + t);
    }
    expect(state.vitals['jason-3']).toMatchObject({ level: expected, hrBpm: null, rrBpm: null });
    if (expected === 'red') expect(state.alerts[0]).toMatchObject({ level: 'red', facts: { postureEvents: [{ kind: 'fall', seconds: 0 }] } });
    else expect(state.alerts).toHaveLength(0);
  });
  it.each([[.45, 3, 'red', 'headDrop'], [.24, 8, 'amber', 'slump']] as const)
    ('requests %s posture after %s seconds without a face', (head, seconds, level, kind) => {
      const state = room(), bodies = new BodyTracker(), faces = new FaceTracker();
      const signals = new Map(state.visits.map(visit => [visit.id, createSignalTracker()]));
      const gallery = state.visits.map((visit, i) => ({ visitId: visit.id, name: visit.name, descriptor: [i, i] }));
      for (let t = 0; t <= 200; t += 100) faces.update([.3, .7].map((x, i) => ({ box: { x: x * 640 - 30, y: 70, w: 60, h: 70 },
        score: .95, descriptor: [i, i], landmarks: [] })), gallery, t);
      for (let t = 200; t <= 4400 + seconds * 1000; t += 200) {
        const current = [pose(.3, t >= 4400 ? head : .2), pose(.7, .2)];
        // Change MediaPipe array order every frame to exercise geometric matching.
        bodies.update(t % 400 ? current : current.reverse(), t === 200 ? faces.current(200) : [], gallery, t, 640, 480);
        const observations = bodies.current(t).map(track => {
          const tracker = signals.get(track.match!.visitId)!;
          tracker.pushPose({ t, landmarks: track.pose });
          return makeObservation(track, tracker.read(t), { cam: 'A', source: 'replay', now: 100_000 + t, width: 640, height: 480 });
        });
        if (t % 1000 === 400) ingest(state, observations, 100_000 + t);
      }
      expect(state.alerts).toHaveLength(1);
      expect(state.alerts[0]).toMatchObject({ visitId: 'jason-3', level, facts: { name: 'Jason', queueNo: 3,
        hrBpm: null, hrReason: null, postureEvents: expect.arrayContaining([{ kind, seconds }]) } });
      expect(state.vitals['jason-4'].level).toBe('none');
      expect(state.alerts[0].reasons.join(' ')).toContain('Heart rate unavailable');
    });
});
