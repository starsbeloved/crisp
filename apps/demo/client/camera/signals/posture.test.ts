import { expect, it } from 'vitest';
import { createSignalTracker, type PoseSample } from './index.ts';

function pose(t: number, shift = 0, head = .2, visibility = .9): PoseSample {
  const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: head + shift, z: 0, visibility }));
  landmarks[11] = { x: .4, y: .4 + shift, z: 0, visibility };
  landmarks[12] = { x: .6, y: .4 + shift, z: 0, visibility };
  landmarks[23] = { x: .43, y: .7 + shift, z: 0, visibility };
  landmarks[24] = { x: .57, y: .7 + shift, z: 0, visibility };
  return { t, landmarks };
}
it('learns stable seated posture within five seconds at moderate visibility', () => {
  const tracker = createSignalTracker();
  expect(tracker.read(0).referenceReady).toBe(false);
  for (let t = 0; t <= 4000; t += 200) tracker.pushPose(pose(t, 0, .2, .6));
  expect(tracker.read(4000).referenceReady).toBe(true);
  for (let t = 4200; t <= 12_200; t += 200) tracker.pushPose(pose(t, 0, .24, .6));
  expect(tracker.read(12_200).posture?.slumpSec).toBe(8);
});
it('does not report a routine stand and sit as a fall or slump', () => {
  const tracker = createSignalTracker();
  for (let t = 0; t <= 4000; t += 100) tracker.pushPose(pose(t, .1));
  for (let t = 4100; t <= 4800; t += 100) tracker.pushPose(pose(t, .1 - .28 * (t - 4000) / 800));
  for (let t = 4900; t <= 5500; t += 100) tracker.pushPose(pose(t, -.18));
  for (let t = 5600; t <= 6300; t += 100) tracker.pushPose(pose(t, -.18 + .28 * (t - 5500) / 800));
  expect(tracker.read(6300).posture).toMatchObject({ fallSuspected: false, slumpSec: 0, headDropSec: 0 });
});

it('flags a fast downward velocity when the body drops into a low posture', () => {
  const tracker = createSignalTracker();
  for (let t = 0; t <= 4000; t += 200) tracker.pushPose(pose(t));
  tracker.pushPose(pose(4100, .2));
  tracker.pushPose(pose(4200, .22));
  expect(tracker.read(4200).posture).toMatchObject({ fallSuspected: true });
  expect(tracker.read(4200).velocity).toBeGreaterThan(1);
});

it('keeps a head drop signal when the face landmark becomes unavailable but the body remains visible', () => {
  const tracker = createSignalTracker();
  for (let t = 0; t <= 4000; t += 200) tracker.pushPose(pose(t));
  for (let t = 4200; t <= 7200; t += 200) {
    const sample = pose(t, 0, .6);
    sample.landmarks[0].visibility = .2;
    tracker.pushPose(sample);
  }
  expect(tracker.read(7200).posture?.headDropSec).toBe(3);
});
