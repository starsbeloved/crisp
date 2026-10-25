import type { DetectedFace } from '../lib/face.ts';

/** These checks protect enrollment; rejected frames never contribute a descriptor. */
export function assessFace(faces: DetectedFace[]): { message: string; descriptor: number[] | null } {
  if (!faces.length) return { message: 'Move into view', descriptor: null };
  if (faces.length !== 1) return { message: 'Only one person, please', descriptor: null };
  const face = faces[0];
  if (face.box.w < 120) return { message: 'Move closer', descriptor: null };
  if (face.score < 0.8 || face.descriptor.length !== 128 || !face.descriptor.every(Number.isFinite)) {
    return { message: 'Hold still…', descriptor: null };
  }
  return { message: 'Hold still…', descriptor: face.descriptor };
}
export function averageDescriptors(samples: number[][]): number[] {
  return samples[0].map((_, column) => samples.reduce((sum, sample) => sum + sample[column], 0) / samples.length);
}
