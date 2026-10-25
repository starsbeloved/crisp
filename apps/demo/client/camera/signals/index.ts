import type { Quality, PostureState } from '../../../shared/types.ts';
export interface FaceSample { t: number; rgb: [number, number, number]; brightness: number; faceWidthPx: number }
export interface PoseSample { t: number; landmarks: { x: number; y: number; z: number; visibility: number }[] }
export interface SignalReading { hrBpm: number | null; hrQuality: Quality; rrBpm: number | null; rrQuality: Quality;
  posture: PostureState | null; hint: string | null; hrSecondsCollected: number; pulseTrace: number[] | null }
export interface SignalTracker { pushFace(s: FaceSample): void; pushPose(s: PoseSample): void; read(now: number): SignalReading; reset(): void }
export function createSignalTracker(): SignalTracker {
  return { pushFace() {}, pushPose() {}, read: () => ({ hrBpm: null, hrQuality: 'none', rrBpm: null, rrQuality: 'none', posture: null, hint: null, hrSecondsCollected: 0, pulseTrace: null }), reset() {} };
}
