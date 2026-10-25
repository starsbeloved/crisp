import * as faceapi from '@vladmandic/face-api/dist/face-api.esm.js';
import type { GalleryEntry } from '../../shared/types.ts';
let loading: Promise<void> | null = null;
export async function loadFaceModels(): Promise<void> {
  if (!loading) {
    const path = '/models/face-api-1.7.15';
    loading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(path),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(path),
      faceapi.nets.faceRecognitionNet.loadFromUri(path),
    ]).then(() => undefined).catch(error => { loading = null; throw error; });
  }
  return loading;
}
export type DetectedFace = { box: { x: number; y: number; w: number; h: number }; score: number; descriptor: number[]; landmarks: { x: number; y: number }[] };
export async function detectFaces(source: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedFace[]> {
  await loadFaceModels();
  const results = await faceapi.detectAllFaces(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 })).withFaceLandmarks(true).withFaceDescriptors();
  return results.map(result => ({
    box: { x: result.detection.box.x, y: result.detection.box.y, w: result.detection.box.width, h: result.detection.box.height },
    score: result.detection.score, descriptor: Array.from(result.descriptor),
    landmarks: result.landmarks.positions.map(p => ({ x: p.x, y: p.y })),
  }));
}
export function faceDistance(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return Infinity;
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
}
export function matchFace(d: number[], gallery: GalleryEntry[], threshold = 0.5): { visitId: string; name: string; score: number } | null {
  let best: ReturnType<typeof matchFace> = null;
  let nearest = threshold;
  for (const entry of gallery) {
    const distance = faceDistance(d, entry.descriptor);
    if (distance < nearest) { nearest = distance; best = { visitId: entry.visitId, name: entry.name, score: 1 - distance }; }
  }
  return best;
}
