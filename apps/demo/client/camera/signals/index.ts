import type { Quality, PostureState } from '../../../shared/types.ts';
import { median } from './dsp.ts';
import { estimatePulse, validFace } from './pulse.ts';
import { createPoseSignals } from './posture.ts';
import { createHeartRateDisplay, type HeartRateDisplay } from './display.ts';
import type { FallTrigger } from './faceMotion.ts';
export { signalDisplayLabel } from './display.ts';
export interface FaceSample { t: number; rgb: [number, number, number]; brightness: number; faceWidthPx: number }
export interface PoseSample { t: number; landmarks: { x: number; y: number; z: number; visibility: number }[] }
export interface SignalReading { hrBpm: number | null; hrQuality: Quality; rrBpm: number | null; rrQuality: Quality;
  posture: PostureState | null; hint: string | null; hrSecondsCollected: number; pulseTrace: number[] | null;
  hrDisplay?: HeartRateDisplay; hrSnr?: number; referenceReady?: boolean; velocity: number; faceVelocity?: number; fallTrigger?: FallTrigger }
export interface SignalTracker { pushFace(s: FaceSample): void; pushPose(s: PoseSample): void; read(now: number): SignalReading; reset(): void }
export function createSignalTracker(): SignalTracker {
  const pose = createPoseSignals();
  const display = createHeartRateDisplay();
  let faces: FaceSample[] = [], estimates: number[] = [];
  let pulse: ReturnType<typeof estimatePulse> = { bpm: null, quality: 'none', trace: null };
  let lastEstimate = -Infinity, pendingJump: { bpm: number; t: number } | null = null;
  let motionUntil = -Infinity;
  function clearFace() {
    faces = []; estimates = []; pulse = { bpm: null, quality: 'none', trace: null };
    lastEstimate = -Infinity; pendingJump = null; motionUntil = -Infinity;
  }
  return {
    pushFace(s) {
      if (!Number.isFinite(s.t)) return;
      const previous = faces.at(-1);
      if (previous && s.t <= previous.t) return;
      if (previous && s.t - previous.t > 1000) clearFace();
      else if (previous && (Math.abs(s.faceWidthPx - previous.faceWidthPx) / previous.faceWidthPx > 0.04 ||
        Math.abs(s.brightness - previous.brightness) / Math.max(1, previous.brightness) > 0.08)) motionUntil = s.t + 500;
      faces.push({ ...s, rgb: [...s.rgb] });
      // Retain one sample before the ten-second boundary for interpolation.
      while (faces.length > 2 && faces[1].t < s.t - 10_000) faces.shift();
    },
    pushPose(s) { pose.push(s); },
    read(now) {
      const latest = faces.at(-1), age = latest ? now - latest.t : Infinity;
      const fresh = !!latest && Number.isFinite(now) && age >= 0 && age <= 1000;
      const seconds = fresh ? Math.min(10, (latest.t - faces[0].t) / 1000) : 0;
      const hint = fresh ? latest.brightness < 50 ? 'too dark' : latest.faceWidthPx < 90 ? 'move closer'
        : now <= motionUntil ? 'hold still' : null : null;
      if (fresh && seconds >= 5 && latest.t - lastEstimate >= 1000) {
        pulse = estimatePulse(faces);
        lastEstimate = latest.t;
        if (pulse.bpm !== null && seconds >= 10) {
          const old = estimates.length ? median(estimates) : null;
          if (old !== null && Math.abs(pulse.bpm - old) > 25) {
            if (!pendingJump || Math.abs(pulse.bpm - pendingJump.bpm) > 10) pendingJump = { bpm: pulse.bpm, t: latest.t };
            if (latest.t - pendingJump.t >= 3000) { estimates = [pulse.bpm]; pendingJump = null; }
            else { pulse = { ...pulse, bpm: null }; }
          } else {
            estimates.push(pulse.bpm); estimates = estimates.slice(-5); pendingJump = null;
          }
          if (pulse.bpm !== null) pulse.bpm = median(estimates);
        } else if (pulse.bpm === null) {
          // A brief bad window must not erase the previous rate and bypass jump confirmation.
          // A source gap or reset() clears that history in clearFace().
          pendingJump = null;
        }
      }
      const usable = fresh && validFace(latest) && hint !== 'hold still';
      const hrBpm = usable && seconds >= 10 ? pulse.bpm : null;
      const hrQuality = !latest ? 'none' : !usable ? 'low' : seconds < 10 ? 'none' : pulse.quality;
      return { hrBpm, hrQuality, hrSnr: usable ? pulse.snr : undefined, hrDisplay: display.update(hrBpm, hrQuality, lastEstimate, now),
        hrSecondsCollected: seconds, pulseTrace: usable && seconds >= 5 ? pulse.trace : null,
        ...pose.read(now), hint };
    },
    reset() { clearFace(); pose.reset(); display.reset(); },
  };
}
