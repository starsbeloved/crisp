import { describe, expect, it } from 'vitest';
import { createSignalTracker, type PoseSample, type SignalTracker } from '../client/camera/signals/index.ts';

function pose(t: number, head = 0, shift = 0, tilt = 0): PoseSample {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  landmarks[0] = { x: 0.5 + tilt, y: 0.2 + head + shift, z: 0, visibility: 1 };
  landmarks[11] = { x: 0.4 + tilt, y: 0.4 + shift, z: 0, visibility: 1 };
  landmarks[12] = { x: 0.6 + tilt, y: 0.4 + shift, z: 0, visibility: 1 };
  landmarks[23] = { x: 0.43, y: 0.7 + shift, z: 0, visibility: 1 };
  landmarks[24] = { x: 0.57, y: 0.7 + shift, z: 0, visibility: 1 };
  return { t, landmarks };
}

function hold(tracker: SignalTracker, start: number, end: number, head = 0, shift = 0, tilt = 0) {
  for (let t = start; t < end; t += 1000 / 30) tracker.pushPose(pose(t, head, shift, tilt));
  tracker.pushPose(pose(end, head, shift, tilt));
  return tracker.read(end).posture;
}

describe('P3 posture', () => {
  it('learns a reference then resets a three-second bend on recovery', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 11_000);
    const leaning = hold(tracker, 11_034, 14_034, 0.05);
    expect(leaning).not.toBeNull();
    expect(leaning!.slumpSec).toBeGreaterThanOrEqual(2.9);
    expect(leaning!.slumpSec).toBeLessThan(10);
    expect(hold(tracker, 14_068, 15_000)?.slumpSec).toBe(0);
  });

  it('counts a sustained twelve-second slump', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 11_000);
    expect(hold(tracker, 11_034, 23_034, 0.05)?.slumpSec).toBeGreaterThanOrEqual(11.9);
  });

  it('detects torso angle changes independently of head descent', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 11_000);
    expect(hold(tracker, 11_034, 23_034, 0, 0, 0.12)?.slumpSec).toBeGreaterThanOrEqual(11.9);
  });

  it('counts nose below shoulder and resets on recovery', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 11_000);
    expect(hold(tracker, 11_034, 17_034, 0.24)?.headDropSec).toBeGreaterThanOrEqual(5.9);
    expect(hold(tracker, 17_068, 18_000)?.headDropSec).toBe(0);
  });

  it('counts stillness, clears it on motion, and never bridges missing pose', () => {
    const tracker = createSignalTracker();
    expect(hold(tracker, 0, 31_000)?.stillSec).toBeGreaterThanOrEqual(30);
    tracker.pushPose(pose(31_034, 0.1));
    expect(tracker.read(31_034).posture?.stillSec).toBe(0);
    tracker.pushPose({ t: 31_068, landmarks: [] });
    expect(tracker.read(31_068).posture).toBeNull();
    expect(hold(tracker, 31_102, 32_000)?.stillSec).toBeLessThan(1);
  });

  it('detects a fast shoulder and hip drop', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 2000);
    for (let t = 2034; t <= 2500; t += 34) tracker.pushPose(pose(t, 0, 0.28 * (t - 2000) / 500));
    tracker.pushPose(pose(2500, 0, 0.28));
    expect(tracker.read(2500).posture?.fallSuspected).toBe(true);
    // Retain the observed event long enough for the camera's ~1 Hz observation send.
    expect(hold(tracker, 2534, 3100, 0, 0.28)?.fallSuspected).toBe(true);
    expect(hold(tracker, 3134, 5000)?.fallSuspected).toBe(false);
  });

  it('detects hips leaving the frame bottom with shoulders dropping', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 2000, 0, 0.1);
    const fallen = pose(2400, 0, 0.3);
    fallen.landmarks[23].visibility = 0.1;
    fallen.landmarks[24].visibility = 0.1;
    tracker.pushPose(fallen);
    expect(tracker.read(2400).posture?.fallSuspected).toBe(true);
  });

  it('ignores slow descent and downward head motion alone as falls', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 2000);
    for (let t = 2034; t <= 7000; t += 34) {
      tracker.pushPose(pose(t, 0.06, 0.26 * (t - 2000) / 5000));
      expect(tracker.read(t).posture?.fallSuspected).toBe(false);
    }
  });

  it('does not repeat a past fall while hips remain outside the visible frame', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 2000, 0, 0.1);
    for (let t = 2400; t <= 5000; t += 40) {
      const outOfFrame = pose(t, 0, 0.3);
      outOfFrame.landmarks[23].visibility = outOfFrame.landmarks[24].visibility = 0.1;
      tracker.pushPose(outOfFrame);
      if (t === 2400) expect(tracker.read(t).posture?.fallSuspected).toBe(true);
    }
    expect(tracker.read(5000).posture?.fallSuspected ?? false).toBe(false);
  });

  it('withholds stale posture and clears counters across a gap', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 11_000);
    hold(tracker, 11_034, 23_034, 0.05);
    expect(tracker.read(25_000).posture).toBeNull();
    tracker.pushPose(pose(33_034, 0.05));
    expect(tracker.read(33_034).posture?.slumpSec).toBe(0);
  });

  it('relearns the reference after reset', () => {
    const tracker = createSignalTracker();
    hold(tracker, 0, 11_000);
    tracker.reset();
    hold(tracker, 12_000, 23_000, 0.05);
    expect(hold(tracker, 23_034, 35_000, 0.05)?.slumpSec).toBe(0);
  });
});

describe('P3 independent pose breathing', () => {
  function breathe(tracker: SignalTracker, end: number, bpm: number, flat = false) {
    let previousRead = 0;
    for (let i = 0, t = 0; t <= end; i++, t += 34 + (i % 7) * 2) {
      const shift = flat ? 0 : 0.002 * Math.sin(2 * Math.PI * bpm / 60 * t / 1000);
      tracker.pushPose(pose(t, 0, shift));
      if (t - previousRead >= 1000) { tracker.read(t); previousRead = t; }
    }
    tracker.pushPose(pose(end, 0, flat ? 0 : 0.002 * Math.sin(2 * Math.PI * bpm / 60 * end / 1000)));
    return tracker.read(end);
  }

  it.each([9, 15, 30])('estimates %i breaths/min from shoulder motion without any face input', bpm => {
    const result = breathe(createSignalTracker(), 35_000, bpm);
    expect(result.rrBpm).not.toBeNull();
    expect(Math.abs(result.rrBpm! - bpm)).toBeLessThanOrEqual(1);
    expect(['good', 'fair']).toContain(result.rrQuality);
    expect(result.hrBpm).toBeNull();
  });

  it('returns no rate before twenty seconds', () => {
    expect(breathe(createSignalTracker(), 19_000, 15).rrBpm).toBeNull();
    expect(breathe(createSignalTracker(), 20_100, 15).rrBpm).not.toBeNull();
  });

  it('does not invent breathing from a stationary pose', () => {
    expect(breathe(createSignalTracker(), 35_000, 15, true)).toMatchObject({ rrBpm: null, rrQuality: 'low' });
  });

  it('rejects motion above the breathing frequency band', () => {
    expect(breathe(createSignalTracker(), 35_000, 72)).toMatchObject({ rrBpm: null, rrQuality: 'low' });
  });

  it('does not estimate breathing from undersampled pose motion', () => {
    const tracker = createSignalTracker();
    for (let t = 0; t <= 35_000; t += 1000) {
      tracker.pushPose(pose(t, 0, 0.002 * Math.sin(2 * Math.PI * 0.7 * t / 1000)));
    }
    expect(tracker.read(35_000)).toMatchObject({ rrBpm: null, rrQuality: 'low' });
  });

  it('drops stale breathing readings and resets collection on missing pose', () => {
    const tracker = createSignalTracker();
    expect(breathe(tracker, 35_000, 15).rrBpm).not.toBeNull();
    expect(tracker.read(45_000)).toMatchObject({ rrBpm: null, rrQuality: 'low' });
    tracker.pushPose({ t: 45_034, landmarks: [] });
    hold(tracker, 45_068, 50_000);
    expect(tracker.read(50_000).rrBpm).toBeNull();
  });
});
