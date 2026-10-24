import type { Bounds, FramePacket } from '../../shared/contracts.ts';

export type FaceDetection = {
  bounds: Bounds;
  descriptor: number[];
  usable: boolean;
  reason: string | null;
  faceSkin?: Bounds[];
};
/** A worker-backed adapter must return fresh detections, never cached/interpolated faces. */
export type FaceAdapter = {
  modelId: string;
  detect(image: ImageBitmap, metadata: { width:number; height:number; sourceAtMs:number }): Promise<FaceDetection[]>;
  similarity(a: readonly number[], b: readonly number[]): number;
};
export type FrameIdentity = Pick<FramePacket, 'runId'|'seq'|'sourceAtMs'>;
export type Enrollment = { visitId:string; modelId:string; samples:number[][]; capturedAtMs:number };
export type EnrollmentReceipt = Omit<Enrollment,'samples'> & {sampleCount:number};
export type Calibration = { modelId:string; threshold:number; margin:number };
export type ObservedRegion = {label:string; bounds:Bounds};
