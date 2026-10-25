import type { PostureState, Quality } from '../../../shared/types.ts';
import type { PoseSample } from './index.ts';
import { mean, median, resample, spectrum } from './dsp.ts';
import { qualityForRatio } from './pulse.ts';

export const POSE_THRESHOLDS = {
  visibility: 0.4, referenceMs: 4000, gapMs: 1000,
  motionPerFrame: 0.003, headDescentWidths: 0.12, torsoAngleChangeDeg: 15,
  shoulderMotionPerFrame: 0.001,
  fallDrop: 0.25, fallVelocity: 1.2, lowHipY: 0.88, fallHoldMs: 1500,
} as const;

type Point = PoseSample['landmarks'][number];
type Geometry = { t: number; head: number; angle: number; shoulderY: number; hipY: number;
  width: number; points: Point[] };

const finitePoint = (p: Point | undefined): p is Point => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const visiblePoint = (p: Point | undefined): p is Point => finitePoint(p) &&
  Number.isFinite(p.visibility) && p.visibility >= POSE_THRESHOLDS.visibility &&
  p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

function geometry(s: PoseSample): Geometry | null {
  const p = s.landmarks;
  if (![11, 12].every(i => visiblePoint(p[i]))) return null;
  const shoulderY = (p[11].y + p[12].y) / 2, shoulderX = (p[11].x + p[12].x) / 2;
  // MediaPipe extrapolates hidden hips beyond the image. They cannot veto observed head/shoulders
  // or supply torso-angle/fall evidence. NaN keeps unavailable hip measurements out of comparisons.
  const hipsVisible = [23, 24].every(i => visiblePoint(p[i]));
  const hipY = hipsVisible ? (p[23].y + p[24].y) / 2 : NaN;
  const hipX = hipsVisible ? (p[23].x + p[24].x) / 2 : NaN;
  const width = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y);
  if (width < 0.03) return null;
  return { t: s.t, shoulderY, hipY, width,
    head: finitePoint(p[0]) ? (p[0].y - shoulderY) / width : NaN,
    angle: Math.atan2(shoulderX - hipX, hipY - shoulderY) * 180 / Math.PI,
    points: [0, 11, 12].map(i => p[i]) };
}

/** One reference and three continuous counters per recognized person. No browser or model state. */
export function createPoseSignals() {
  let lastAt: number | null = null, previous: Geometry | null = null, recent: Geometry[] = [];
  let reference: Geometry[] = [], baseline: { head: number; angle: number; shoulderY: number; hipY: number } | null = null;
  let slumpStart: number | null = null, headStart: number | null = null, stillStart: number | null = null;
  let fallUntil = -Infinity, posture: PostureState | null = null;
  let velocity = 0, fastDropAt = -Infinity;
  let breaths: { t: number; value: number }[] = [], rrBpm: number | null = null, rrQuality: Quality = 'none', lastEstimate = -Infinity;

  function breakContinuity() {
    previous = null; recent = []; reference = []; slumpStart = headStart = stillStart = null;
    fallUntil = -Infinity; posture = null;
    velocity = 0; fastDropAt = -Infinity; breaths = []; rrBpm = null; rrQuality = 'none'; lastEstimate = -Infinity;
  }

  return {
    push(s: PoseSample) {
      if (!Number.isFinite(s.t) || (lastAt !== null && s.t <= lastAt)) return;
      if (lastAt !== null && s.t - lastAt > POSE_THRESHOLDS.gapMs) breakContinuity();
      const dt = lastAt === null ? 0 : s.t - lastAt;
      lastAt = s.t;
      const g = geometry(s);
      if (!g) {
        const fall = s.t - fastDropAt <= POSE_THRESHOLDS.fallHoldMs || s.t <= fallUntil;
        const observedUntil = s.t <= fallUntil ? fallUntil : s.t + POSE_THRESHOLDS.fallHoldMs;
        breakContinuity(); rrQuality = 'low';
        if (fall) {
          fallUntil = observedUntil;
          posture = { slumpSec: 0, headDropSec: 0, stillSec: 0, fallSuspected: true };
        }
        return;
      }
      recent = recent.filter(v => s.t - v.t <= 1000);
      const returningToSeat = baseline !== null && g.shoulderY <= baseline.shoulderY + .08 &&
        (!Number.isFinite(g.hipY) || !Number.isFinite(baseline.hipY) || g.hipY <= baseline.hipY + .08);
      velocity = previous && dt > 0 ? Math.max(...g.points.slice(0, 3).map((point, i) => {
        const prior = previous!.points[i];
        return finitePoint(prior) && finitePoint(point) ? (point.y - prior.y) / g.width * 1000 / dt : 0;
      })) : 0;
      const shoulderVelocity = previous && dt > 0 ? (g.shoulderY - previous.shoulderY) / g.width * 1000 / dt : 0;
      if (shoulderVelocity >= POSE_THRESHOLDS.fallVelocity ||
        (velocity >= POSE_THRESHOLDS.fallVelocity && g.head > -.25)) fastDropAt = s.t;
      const fell = !returningToSeat && recent.some(v => {
        const shoulderDrop = g.shoulderY - v.shoulderY, hipDrop = g.hipY - v.hipY;
        return (shoulderDrop + hipDrop) / 2 > POSE_THRESHOLDS.fallDrop && shoulderDrop > 0.15 && hipDrop > 0.15 ||
          v.hipY < 0.98 && g.hipY >= 0.98 && shoulderDrop > 0.12;
      }) || (s.t - fastDropAt <= POSE_THRESHOLDS.fallHoldMs && (g.hipY >= POSE_THRESHOLDS.lowHipY ||
        recent.some(v =>
          !returningToSeat && (g.shoulderY - v.shoulderY) / g.width >= 1 ||
          g.head > -.25 && finitePoint(g.points[0]) && finitePoint(v.points[0]) && (g.points[0].y - v.points[0].y) / g.width >= 1)));
      if (fell) fallUntil = s.t + POSE_THRESHOLDS.fallHoldMs;
      recent.push(g);
      const motion = previous && dt > 0 ? mean(g.points.map((p, i) =>
        Math.hypot(p.x - previous!.points[i].x, p.y - previous!.points[i].y))) * (1000 / 30) / dt : null;
      const stationary = motion !== null && motion < POSE_THRESHOLDS.motionPerFrame;
      if (!baseline) {
        if ((!previous || stationary) && g.head < 0 && (!Number.isFinite(g.angle) || Math.abs(g.angle) <= 20)) {
          reference.push(g);
          if (s.t - reference[0].t >= POSE_THRESHOLDS.referenceMs) {
            baseline = { head: median(reference.map(v => v.head)), angle: median(reference.map(v => v.angle)),
              shoulderY: median(reference.map(v => v.shoulderY)), hipY: median(reference.map(v => v.hipY)) };
            reference = [];
          }
        } else reference = [];
      }
      const slumped = baseline !== null && (g.head - baseline.head >= POSE_THRESHOLDS.headDescentWidths - 1e-9 ||
        Math.abs(g.angle - baseline.angle) >= POSE_THRESHOLDS.torsoAngleChangeDeg - 1e-9);
      slumpStart = slumped ? slumpStart ?? s.t : null;
      headStart = Number.isFinite(g.head) && g.head > 0 ? headStart ?? s.t : null;
      stillStart = stationary ? stillStart ?? previous!.t : null;
      posture = { slumpSec: slumpStart === null ? 0 : (s.t - slumpStart) / 1000,
        headDropSec: headStart === null ? 0 : (s.t - headStart) / 1000,
        stillSec: stillStart === null ? 0 : (s.t - stillStart) / 1000, fallSuspected: s.t <= fallUntil };
      // Gate shoulders separately: averaging five body points can hide shoulder sway.
      const shoulderMotion = previous && dt > 0 ? Math.max(...[1, 2].map(i =>
        Math.hypot(g.points[i].x - previous!.points[i].x, g.points[i].y - previous!.points[i].y))) * (1000 / 30) / dt : null;
      const breathingStill = stationary && shoulderMotion !== null && shoulderMotion < POSE_THRESHOLDS.shoulderMotionPerFrame;
      if (!breathingStill) {
        breaths = []; rrBpm = null; rrQuality = 'low'; lastEstimate = -Infinity;
      }
      if (breathingStill) breaths.push({ t: s.t, value: g.shoulderY / g.width });
      while (breaths.length > 2 && breaths[1].t < s.t - 30_000) breaths.shift();
      previous = g;
    },
    read(now: number) {
      const fresh = lastAt !== null && Number.isFinite(now) && now >= lastAt && now - lastAt <= 1000;
      const duration = breaths.length > 1 ? breaths.at(-1)!.t - breaths[0].t : 0;
      if (fresh && duration >= 20_000 && lastAt! - lastEstimate >= 1000) {
        const cadence = (breaths.length - 1) * 1000 / duration;
        const peak = cadence >= 2 ? spectrum(resample(breaths, 15, s => s.value), 15, 0.1, 0.7) : { hz: null, ratio: 0 };
        rrQuality = qualityForRatio(peak.ratio);
        rrBpm = peak.hz !== null && rrQuality !== 'low' ? peak.hz * 60 : null;
        lastEstimate = lastAt!;
      }
      return { referenceReady: fresh && baseline !== null, velocity: fresh ? velocity : 0, rrBpm: fresh ? rrBpm : null,
        rrQuality: lastAt === null ? 'none' as const : !fresh ? 'low' as const : rrQuality,
        posture: fresh && posture ? { ...posture, fallSuspected: now <= fallUntil } : null };
    },
    reset() { lastAt = null; baseline = null; breakContinuity(); },
  };
}
