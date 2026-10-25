import { describe, expect, it } from 'vitest';
import { FaceTracker, normalizedBox, poseForFace } from './tracking.ts';
import { cheekPatches, meanCheekSample } from './sampling.ts';
import type { DetectedFace } from '../lib/face.ts';

const gallery = [
  { visitId: 'ama', name: 'Ama', descriptor: [0, 0] },
  { visitId: 'ben', name: 'Ben', descriptor: [1, 1] },
];
function face(x = 100, descriptor = [0.1, 0]): DetectedFace {
  return { box: { x, y: 80, w: 100, h: 120 }, score: 0.95, descriptor, landmarks: [] };
}

describe('face tracking and identity', () => {
  it('detects a fast one-face-height descent without any skeleton', () => {
    const tracker = new FaceTracker();
    for (const t of [0, 250, 500]) tracker.update([face()], gallery, t);
    tracker.update([{ ...face(), box: { ...face().box, y: 200 } }], gallery, 750);
    expect(tracker.current(750)[0]).toMatchObject({ match: { visitId: 'ama' },
      faceMotion: { fallSuspected: true, trigger: 'face-drop', velocity: 4 } });
    expect(tracker.current(2400)).toEqual([]);
  });

  it('retains observed downward disappearance long enough to report a fall, with no face vitals', () => {
    const tracker = new FaceTracker();
    for (const t of [0, 250, 500]) tracker.update([face()], gallery, t);
    tracker.update([{ ...face(), box: { ...face().box, y: 140 } }], gallery, 750);
    tracker.update([], gallery, 1000);
    expect(tracker.current(1600)[0]).toMatchObject({ match: { visitId: 'ama' }, faceMissing: true,
      faceMotion: { fallSuspected: true, trigger: 'face-disappeared' } });
    tracker.setGallery([]);
    expect(tracker.current(1600)[0].match).toBeNull();
    expect(tracker.current(2600)).toEqual([]);
  });

  it('ignores slow sitting, sideways loss, upward loss, jitter and stale samples', () => {
    for (const [dx, dy, step] of [[0, 10, 250], [120, 0, 250], [0, -60, 250], [0, 5, 250], [0, 120, 1500]]) {
      const tracker = new FaceTracker();
      for (let i = 0; i < 4; i++) {
        tracker.update([{ ...face(100 + dx * i), box: { ...face(100 + dx * i).box, y: 80 + dy * i } }], gallery, i * step);
        expect(tracker.current(i * step).some(t => t.faceMotion?.fallSuspected)).toBe(false);
      }
      tracker.update([], gallery, 4 * step);
      expect(tracker.current(4 * step).some(t => t.faceMotion?.fallSuspected)).toBe(false);
    }
  });
  it('requires three agreeing votes and follows identities through a seat swap', () => {
    const tracker = new FaceTracker();
    tracker.update([face(), face(400, [1, 0.9])], gallery, 0);
    expect(tracker.current(0).map(t => t.identity)).toEqual(['identifying', 'identifying']);
    tracker.update([face(102), face(402, [1, 0.9])], gallery, 100);
    tracker.update([face(104), face(404, [1, 0.9])], gallery, 200);
    const before = tracker.current(200);
    expect(before.map(t => t.match?.visitId)).toEqual(['ama', 'ben']);
    const amaId = before[0].id;
    tracker.update([face(400), face(100, [1, 0.9])], gallery, 300);
    const after = tracker.current(300);
    expect(after.find(t => t.match?.visitId === 'ama')).toMatchObject({ id: amaId, face: { box: { x: 400 } } });
    expect(after.find(t => t.match?.visitId === 'ben')?.face.box.x).toBe(100);
  });

  it('keeps strangers unknown, expires missing faces, and removes called identities', () => {
    const tracker = new FaceTracker();
    for (let t = 0; t < 300; t += 100) tracker.update([face(100, [3, 3])], gallery, t);
    expect(tracker.current(200)[0]).toMatchObject({ identity: 'unknown', match: null });
    expect(tracker.current(1500)).toEqual([]);
    for (let t = 2000; t < 2300; t += 100) tracker.update([face()], gallery, t);
    tracker.setGallery([]);
    expect(tracker.current(2200)[0].match).toBeNull();
  });

  it('resolves duplicate visits by higher mean score and staff correction is immediate', () => {
    const tracker = new FaceTracker();
    for (let t = 0; t < 300; t += 100) tracker.update([face(100, [0.2, 0]), face(400, [0.05, 0])], gallery, t);
    const tracks = tracker.current(200);
    expect(tracks.filter(t => t.match?.visitId === 'ama')).toHaveLength(1);
    expect(tracks.find(t => t.face.box.x === 400)?.match?.score).toBeCloseTo(0.95);
    const correctedId = tracks.find(t => t.face.box.x === 100)!.id;
    tracker.assign(correctedId, { visitId: 'ben', name: 'Ben', score: 1 });
    expect(tracker.current(200).find(t => t.id === correctedId)?.match?.visitId).toBe('ben');
  });

  it('does not attach a fresh stranger to the previous occupant of a box', () => {
    const tracker = new FaceTracker();
    for (let t = 0; t < 300; t += 100) tracker.update([face()], gallery, t);
    tracker.update([face(100, [3, 3])], gallery, 300);
    expect(tracker.current(300).filter(t => t.match)).toEqual([]);
  });

  it('clamps normalized boxes and associates a pose by its nose, never array order', () => {
    expect(normalizedBox({ x: -10, y: 460, w: 80, h: 100 }, 640, 480)).toEqual({ x: 0, y: 460 / 480, w: 70 / 640, h: 20 / 480 });
    const poses = [[{ x: 0.8, y: 0.8, z: 0, visibility: 1 }], [{ x: 0.2, y: 0.25, z: 0, visibility: 1 }]];
    expect(poseForFace(face().box, poses, 640, 480)).toBe(poses[1]);
    expect(poseForFace(face().box, [poses[0]], 640, 480)).toBeNull();
  });
});

describe('cheek sampling', () => {
  it('samples only landmark cheek patches, with luma and original face width', () => {
    const detected = face();
    detected.landmarks = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
    for (const [i, x, y] of [[36, 110, 100], [45, 190, 100], [31, 140, 130], [35, 160, 130], [33, 150, 130], [48, 130, 170], [54, 170, 170]]) detected.landmarks[i] = { x, y };
    expect(cheekPatches(detected)).toHaveLength(2);
    const data = new Uint8ClampedArray(320 * 240 * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 100; data[i + 1] = 150; data[i + 2] = 200; data[i + 3] = 255; }
    const sample = meanCheekSample({ data, width: 320, height: 240 }, detected, 640, 480, 123, 1280);
    expect(sample).toMatchObject({ t: 123, rgb: [100, 150, 200], faceWidthPx: 200 });
    expect(sample?.brightness).toBeCloseTo(142.98, 1);
    expect(meanCheekSample({ data, width: 320, height: 240 }, face(), 640, 480, 0, 640)).toBeNull();
  });
});
