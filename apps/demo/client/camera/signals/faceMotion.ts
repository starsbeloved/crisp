import type { SignalReading } from './index.ts';

type Box = { x: number; y: number; w: number; h: number };
type Sample = { t: number; x: number; y: number; h: number };
export type FallTrigger = 'face-drop' | 'face-disappeared' | 'pose' | null;
export interface FaceMotionReading { velocity: number; fallSuspected: boolean; trigger: FallTrigger }

/** Fresh detector results only; velocity is downward face heights per second. */
export function createFaceMotionSignals() {
  let recent: Sample[] = [], lastAt = -Infinity, fastAt = -Infinity;
  let origin: Sample | null = null, velocity = 0, until = -Infinity;
  let trigger: FallTrigger = null;
  return {
    push(t: number, box: Box | null) {
      if (!Number.isFinite(t) || t <= lastAt) return;
      lastAt = t;
      const previous = recent.at(-1);
      if (!previous || t - previous.t > 1000) { recent = []; origin = null; fastAt = -Infinity; velocity = 0; }
      if (!box) {
        // Loss alone proves nothing. Require the immediately preceding fast downward motion.
        if (previous && origin && t - fastAt <= 1000 && previous.y - origin.y >= origin.h * .25 &&
          Math.abs(previous.x - origin.x) < origin.h * .75 && t > until) {
          until = t + 1500; trigger = 'face-disappeared';
        }
        velocity = 0; recent = []; origin = null; fastAt = -Infinity;
        return;
      }
      if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.h <= 0 || box.w <= 0) {
        recent = []; origin = null; velocity = 0; fastAt = -Infinity; return;
      }
      const sample = { t, x: box.x + box.w / 2, y: box.y + box.h / 2, h: box.h };
      const prior = recent.at(-1);
      if (prior && (sample.h / prior.h < .65 || sample.h / prior.h > 1.5)) {
        recent = [sample]; origin = null; velocity = 0; fastAt = -Infinity; return;
      }
      velocity = prior ? (sample.y - prior.y) / prior.h * 1000 / (t - prior.t) : 0;
      recent = recent.filter(s => t - s.t <= 1000);
      if (velocity > 1.5 && prior && Math.abs(sample.x - prior.x) < prior.h * .75) {
        if (!origin || t - fastAt > 1000) origin = recent.reduce((a, b) => a.y < b.y ? a : b, prior);
        fastAt = t;
      }
      if (origin && t - fastAt <= 1000 && sample.y - origin.y >= origin.h &&
        Math.abs(sample.x - origin.x) < origin.h * .75) {
        until = t + 1500; trigger = 'face-drop'; origin = null; fastAt = -Infinity;
      }
      recent.push(sample);
    },
    read(now: number): FaceMotionReading {
      const fallSuspected = Number.isFinite(now) && now >= lastAt && now <= until;
      return { velocity: now >= lastAt && now - lastAt <= 700 ? velocity : 0,
        fallSuspected, trigger: fallSuspected ? trigger : null };
    },
  };
}

export function withFaceMotion(reading: SignalReading, motion?: FaceMotionReading): SignalReading {
  const faceFall = motion?.fallSuspected ?? false;
  return { ...reading, faceVelocity: motion?.velocity ?? 0,
    fallTrigger: faceFall ? motion!.trigger : reading.posture?.fallSuspected ? 'pose' : null,
    posture: faceFall ? { slumpSec: 0, headDropSec: 0, stillSec: 0, ...reading.posture, fallSuspected: true } : reading.posture };
}
