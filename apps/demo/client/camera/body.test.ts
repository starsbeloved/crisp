import { describe, expect, it } from 'vitest';
import * as tracking from './tracking.ts';
import { makeObservation } from './output.ts';
import { createSignalTracker, type PoseSample } from './signals/index.ts';

const gallery = [
  { visitId: 'jason-3', name: 'Jason', descriptor: [0, 0] },
  { visitId: 'jason-4', name: 'Jason', descriptor: [1, 1] },
];
function pose(x = .3, head = .22): PoseSample['landmarks'] {
  const p = Array.from({ length: 33 }, () => ({ x, y: head, z: 0, visibility: .95 }));
  p[11] = { ...p[0], x: x - .08, y: .4 }; p[12] = { ...p[0], x: x + .08, y: .4 };
  p[23] = { ...p[0], x: x - .06, y: .7 }; p[24] = { ...p[0], x: x + .06, y: .7 };
  return p;
}
function identified() {
  const faces = new tracking.FaceTracker();
  for (let t = 0; t <= 200; t += 100) faces.update([.3, .7].map((x, i) => ({
    box: { x: x * 640 - 30, y: 70, w: 60, h: 70 }, descriptor: gallery[i].descriptor,
    score: .95, landmarks: [],
  })), gallery, t);
  return faces;
}
function bodyTracker() {
  expect(tracking.BodyTracker).toBeTypeOf('function');
  return new tracking.BodyTracker();
}
describe('body continuity identity', () => {
  it('retains shoulders and skeleton when hips are occluded', () => {
    const bodies = bodyTracker(), sample = pose();
    sample[23].visibility = sample[24].visibility = .1;
    bodies.update([sample], identified().current(200), gallery, 200, 640, 480);
    expect(bodies.current(200)).toHaveLength(1);
    expect(bodies.current(200)[0]).toMatchObject({ pose: sample, match: { visitId: 'jason-3' } });
  });

  it('keeps an unambiguous body identity through a large fast downward movement', () => {
    const bodies = bodyTracker();
    bodies.update([pose()], identified().current(200), gallery, 200, 640, 480);
    const id = bodies.current(200)[0].id;
    bodies.update([pose().map(point => ({ ...point, y: point.y + .28 }))], [], gallery, 300, 640, 480);
    expect(bodies.current(300)[0]).toMatchObject({ id, source: 'body', match: { visitId: 'jason-3' } });
  });
  it('keeps two same-name visits separate when pose order changes and faces disappear', () => {
    const bodies = bodyTracker(), faces = identified();
    bodies.update([pose(.3), pose(.7)], faces.current(200), gallery, 200, 640, 480);
    const before = bodies.current(200);
    expect(before.map(t => t.match?.visitId)).toEqual(['jason-3', 'jason-4']);
    for (let t = 400; t <= 10_000; t += 200) bodies.update([pose(.7, .45), pose(.3, .45)], [], gallery, t, 640, 480);
    const after = bodies.current(10_000);
    expect(after.find(t => t.match?.visitId === 'jason-3')).toMatchObject({ id: before[0].id, source: 'body' });
    expect(after.find(t => t.match?.visitId === 'jason-4')).toMatchObject({ id: before[1].id, source: 'body' });
    expect(after.find(t => t.id === before[0].id)?.pose[11].x).toBeCloseTo(.22);
  });

  it('sends posture with a null match score after a face disappears', () => {
    const bodies = bodyTracker(), faces = identified(), signals = createSignalTracker();
    bodies.update([pose()], faces.current(200), gallery, 200, 640, 480);
    signals.pushPose({ t: 200, landmarks: bodies.current(200)[0].pose });
    for (let t = 400; t <= 4200; t += 200) {
      bodies.update([pose()], [], gallery, t, 640, 480);
      signals.pushPose({ t, landmarks: bodies.current(t)[0].pose });
    }
    expect(signals.read(4200).referenceReady).toBe(true);
    for (let t = 4400; t <= 7400; t += 200) {
      bodies.update([pose(.3, .45)], [], gallery, t, 640, 480);
      signals.pushPose({ t, landmarks: bodies.current(t)[0].pose });
    }
    expect(makeObservation(bodies.current(7400)[0], signals.read(7400), { cam: 'A', source: 'live', now: 7400, width: 640, height: 480 }))
      .toMatchObject({ visitId: 'jason-3', matchScore: null, hrBpm: null, posture: { headDropSec: 3 } });
  });

  it('expires the identity after 60 seconds without face confirmation', () => {
    const bodies = bodyTracker();
    bodies.update([pose()], identified().current(200), gallery, 200, 640, 480);
    for (let t = 400; t <= 60_200; t += 200) bodies.update([pose()], [], gallery, t, 640, 480);
    expect(bodies.current(60_200)[0].match?.visitId).toBe('jason-3');
    bodies.update([pose()], [], gallery, 60_400, 640, 480);
    expect(bodies.current(60_400)[0].match).toBeNull();
  });

  it('never transfers identity across a missing body, ambiguous crossing, or called visit', () => {
    const bodies = bodyTracker();
    bodies.update([pose()], identified().current(200), gallery, 200, 640, 480);
    bodies.update([pose()], [], gallery, 1800, 640, 480);
    expect(bodies.current(1800)[0].match).toBeNull();
    const facesAt = (t: number) => identified().current(200).map(face => ({ ...face, lastSeen: t }));
    bodies.update([pose(.3), pose(.7)], facesAt(2000), gallery, 2000, 640, 480);
    expect(bodies.current(2000).map(t => t.match?.visitId)).toEqual(['jason-3', 'jason-4']);
    bodies.update([pose(.49), pose(.51)], [], gallery, 2200, 640, 480);
    expect(bodies.current(2200).filter(t => t.match)).toEqual([]);
    bodies.update([pose()], facesAt(2400), gallery, 2400, 640, 480);
    expect(bodies.current(2400)[0].match?.visitId).toBe('jason-3');
    bodies.update([pose()], [], [], 2600, 640, 480);
    expect(bodies.current(2600).filter(t => t.match)).toEqual([]);
  });

  it('clears an old identity when a different face is confirmed on that body', () => {
    const bodies = bodyTracker(), faces = identified();
    bodies.update([pose()], faces.current(200), gallery, 200, 640, 480);
    const returning = faces.current(200)[1];
    bodies.update([pose()], [{ ...returning, lastSeen: 400, face: { ...returning.face, box: { x: 162, y: 70, w: 60, h: 70 } } }], gallery, 400, 640, 480);
    expect(bodies.current(400)[0].match?.visitId).toBe('jason-4');
  });
});
