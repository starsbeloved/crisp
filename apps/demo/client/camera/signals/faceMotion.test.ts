import { expect, it } from 'vitest';
import { createFaceMotionSignals } from './faceMotion.ts';

it('allows detector scheduling jitter when fast downward movement is followed by disappearance', () => {
  const signal = createFaceMotionSignals();
  signal.push(0, { x: 100, y: 100, w: 80, h: 80 });
  signal.push(250, { x: 100, y: 160, w: 80, h: 80 });
  signal.push(500, { x: 100, y: 160, w: 80, h: 80 });
  signal.push(1000, null);
  expect(signal.read(1000)).toMatchObject({ fallSuspected: true, trigger: 'face-disappeared' });
});

it('ignores detector box size jumps rather than interpreting camera approach as a fall', () => {
  const signal = createFaceMotionSignals();
  signal.push(0, { x: 100, y: 100, w: 80, h: 80 });
  signal.push(250, { x: 20, y: 100, w: 240, h: 240 });
  expect(signal.read(250).fallSuspected).toBe(false);
});

it('does not double count a cached frame or connect evidence across invalid boxes and source gaps', () => {
  for (const interruption of ['invalid', 'gap', 'duplicate']) {
    const signal = createFaceMotionSignals();
    signal.push(0, { x: 100, y: 100, w: 80, h: 80 });
    if (interruption === 'invalid') signal.push(100, { x: 100, y: NaN, w: 80, h: 80 });
    signal.push(interruption === 'gap' ? 1500 : interruption === 'duplicate' ? 0 : 250,
      { x: 100, y: 190, w: 80, h: 80 });
    expect(signal.read(interruption === 'gap' ? 1500 : 250).fallSuspected).toBe(false);
  }
});
