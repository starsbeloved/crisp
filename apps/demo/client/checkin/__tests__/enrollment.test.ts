import { describe, expect, it } from 'vitest';
import type { DetectedFace } from '../../lib/face.ts';
import { assessFace, averageDescriptors } from '../enrollment.ts';

function face(patch: Partial<DetectedFace> = {}): DetectedFace {
  return { box: { x: 10, y: 20, w: 140, h: 160 }, score: 0.9, descriptor: Array(128).fill(0.25), landmarks: [], ...patch };
}
describe('face enrollment', () => {
  it('rejects missing, multiple, small, low-confidence and invalid faces', () => {
    expect(assessFace([])).toMatchObject({ descriptor: null, message: 'Move into view' });
    expect(assessFace([face(), face()])).toMatchObject({ descriptor: null, message: 'Only one person, please' });
    expect(assessFace([face({ box: { x: 0, y: 0, w: 119, h: 180 } })])).toMatchObject({ descriptor: null, message: 'Move closer' });
    expect(assessFace([face({ score: 0.79 })]).descriptor).toBeNull();
    expect(assessFace([face({ descriptor: [NaN] })]).descriptor).toBeNull();
    expect(assessFace([face({ score: 0.8, box: { x: 0, y: 0, w: 120, h: 140 } })]).descriptor).toHaveLength(128);
  });
  it('saves the element-wise mean of five actual 128-dimensional samples', () => {
    expect(averageDescriptors([1, 2, 3, 4, 5].map(value => Array(128).fill(value)))).toEqual(Array(128).fill(3));
  });
});
