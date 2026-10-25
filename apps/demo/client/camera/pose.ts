import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const wasmPath = '/models/mediapipe-1.1.1/wasm';
const modelAssetPath = '/models/pose/pose_landmarker_lite.task';

export async function loadPoseModel(): Promise<{ model: PoseLandmarker; delegate: 'GPU' | 'CPU' }> {
  const files = await FilesetResolver.forVisionTasks(wasmPath);
  const common = { numPoses: 2, minPoseDetectionConfidence: .3,
    minPosePresenceConfidence: .3, minTrackingConfidence: .3, runningMode: 'VIDEO' as const };
  try {
    return { model: await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath, delegate: 'GPU' }, ...common }), delegate: 'GPU' };
  } catch (gpuError) {
    try {
      return { model: await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath, delegate: 'CPU' }, ...common }), delegate: 'CPU' };
    } catch (cpuError) {
      const message = (error: unknown) => error instanceof Error ? error.message : String(error);
      throw new Error(`GPU: ${message(gpuError)}; CPU: ${message(cpuError)}`);
    }
  }
}
