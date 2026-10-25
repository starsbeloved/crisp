import * as faceapi from '@vladmandic/face-api/dist/face-api.esm.js';
import type { GalleryEntry } from '../../shared/types.ts';
// The bundled runtime exports these TF APIs; face-api's narrowed declarations omit them.
const tensorRuntime = faceapi.tf as typeof faceapi.tf & {
  engine(): { startScope(): void; endScope(): void };
  memory(): { numTensors: number; numBytes: number; numBytesInGPU?: number; numBytesInGPUAllocated?: number };
};
// TFJS otherwise retains every released WebGL texture forever (-1). Face crop shapes vary
// even while seated, so disposal alone can leave nearly a GiB in the texture pool.
faceapi.tf.ENV.set('WEBGL_DELETE_TEXTURE_THRESHOLD', 64 * 1024 * 1024);
let loading: Promise<void> | null = null;
// Serialize async tensor scopes, including teardown, so one caller cannot dispose another's tensors.
let pending: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
}
export function disposeFaceModels(): Promise<void> {
  return enqueue(async () => {
    await loading?.catch(() => {});
    for (const net of [faceapi.nets.tinyFaceDetector, faceapi.nets.faceLandmark68TinyNet, faceapi.nets.faceRecognitionNet]) {
      if (net.isLoaded) net.dispose(false);
    }
    loading = null;
  });
}
export function faceMemory() {
  const memory = tensorRuntime.memory();
  const gpu = memory.numBytesInGPU;
  return { tensors: memory.numTensors, bytes: memory.numBytes, gpuBytes: gpu ?? null, gpuAllocatedBytes: memory.numBytesInGPUAllocated ?? null };
}
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
export function detectFaces(source: HTMLVideoElement | HTMLCanvasElement, inputSize = 512): Promise<DetectedFace[]> {
  return enqueue(async () => {
    await loadFaceModels();
    // tidy cannot wrap an async function. The serialized scope owns the immutable input and
    // any intermediate tensors left by a rejected model task; face-api uses tidy internally.
    const engine = tensorRuntime.engine();
    engine.startScope();
    try {
      const input = faceapi.tf.tidy(() => faceapi.tf.browser.fromPixels(source));
      const results = await faceapi.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: .4 })).withFaceLandmarks(true).withFaceDescriptors();
      return results.map(result => ({
        box: { x: result.detection.box.x, y: result.detection.box.y, w: result.detection.box.width, h: result.detection.box.height },
        score: result.detection.score, descriptor: Array.from(result.descriptor),
        landmarks: result.landmarks.positions.map(p => ({ x: p.x, y: p.y })),
      }));
    } finally { engine.endScope(); }
  });
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
