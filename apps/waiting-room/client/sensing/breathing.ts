import type { ScalarSample, BreathEstimate } from '../../shared/contracts.ts';
import { detrend, frequency, resample, timing, variance } from './dsp.ts';
/** Independent displacement channel: never consumes pulse or derives heart rate. */
export function estimateBreathing(samples: ScalarSample[]): BreathEstimate {
    const t = timing(samples, 45000), metrics = { ...t.metrics };
    const reject = (reason: string): BreathEstimate => ({ quality: (metrics.durationMs ?? 0) < 45000 ? 'collecting' : 'low-quality', breathsPerMin: null, reason, metrics });
    if (t.reason)
        return reject(t.reason);
    if (samples.some(s => !Number.isFinite(s.value)))
        return reject('Invalid torso displacement');
    const f = frequency(resample(samples, 15, s => s.value), 15, 0.1, 0.6, 2);
    Object.assign(metrics, f.metrics);
    return f.hz === null ? reject(f.reason!) : { quality: 'usable', breathsPerMin: f.hz * 60, reason: null, metrics };
}
import type { SensorContext, SensorRuntime } from '../../shared/contracts.ts';
import type { PixelReaderOptions } from './pixels.ts';
import { createPixelReader, validBounds, validPlane } from './pixels.ts';
import { anchorsInside, backgroundAnchors, estimateLumaDisplacement, prepareMotionFrame, torsoAnchors } from './motion.ts';
import type { MotionPlane, PatchAnchor } from './motion.ts';
import { createSignalRuntime } from './runtime.ts';
import type { MeasurementEmitter } from './runtime.ts';
export function createBreathingRuntime(context: SensorContext, emit: MeasurementEmitter, options: PixelReaderOptions = {}): SensorRuntime {
    const read = options.readPixels ?? createPixelReader();
    let previous: MotionPlane | null = null, anchors: PatchAnchor[] = [], background: PatchAnchor[] = [], displacement = 0, lastAt = 0;
    return createSignalRuntime<ScalarSample>(context, emit, { stream: 'breathing', getContinuityKey:options.getContinuityKey, durationMs: 45000, clear: () => { previous = null; anchors = []; background = []; displacement = 0; lastAt = 0; }, extract(f) {
            const p = read(f), b = f.torso;
            if (!validPlane(p) || p.width !== f.frame.width || p.height !== f.frame.height || !b || !validBounds(b))
                return { sample: null, reason: 'Invalid torso pixels or bounds' };
            const current = prepareMotionFrame(p);
            if (!previous) {
                anchors = torsoAnchors(b, p);
                background = backgroundAnchors(b, p);
                if (!anchorsInside(anchors, b, p))
                    return { sample: null, reason: 'Torso ROI too small for nine 24px patches' };
                // Validate actual texture on the first frame as well as every later frame.
                const check = estimateLumaDisplacement(current, current, anchors);
                if (check.dy === null || check.metrics.validPatches < 5)
                    return { sample: null, reason: check.reason ?? 'Fewer than five usable torso patches', metrics: check.metrics };
                const bg = estimateLumaDisplacement(current, current, background);
                if (bg.dy === null || bg.metrics.validPatches < 3)
                    return { sample: null, reason: 'Fewer than three textured background patches for camera-motion control' };
                previous = current;
                lastAt = f.frame.sourceAtMs;
                return { sample: { tMs: lastAt, value: 0 }, reason: null, metrics: check.metrics };
            }
            if (!anchorsInside(anchors, b, p))
                return { sample: null, reason: 'Torso moved outside fixed patch anchors' };
            const motion = estimateLumaDisplacement(previous, current, anchors), dt = (f.frame.sourceAtMs - lastAt) / 1000;
            if (motion.dy === null || motion.dx === null || motion.metrics.validPatches < 5)
                return { sample: null, reason: motion.reason ?? 'Fewer than five usable torso patches', metrics: motion.metrics };
            if (dt <= 0 || Math.hypot(motion.dx, motion.dy) / dt / (b.width * p.width) > 0.15)
                return { sample: null, reason: 'Gross torso image motion', metrics: motion.metrics };
            const bg = estimateLumaDisplacement(previous, current, background);
            if (bg.dy === null || bg.dx === null || bg.metrics.validPatches < 3)
                return { sample: null, reason: 'Background motion control unavailable' };
            if (Math.hypot(bg.dx, bg.dy) / dt / (b.width * p.width) > 0.15)
                return { sample: null, reason: 'Gross camera or background motion' };
            displacement += motion.dy - bg.dy;
            previous = current;
            lastAt = f.frame.sourceAtMs;
            return { sample: { tMs: lastAt, value: displacement }, reason: null, metrics: { ...motion.metrics, backgroundPatches: bg.metrics.validPatches, backgroundDy: bg.dy } };
        }, estimate(s) {
            // Subpixel NCC has texture-dependent bias. A periodic numerical residual is
            // not enough evidence of chest movement, even when its spectrum is clean.
            const relativeMotionRmsPx = Math.sqrt(variance(detrend(s.map(v => v.value))));
            if (relativeMotionRmsPx < 0.05)
                return { quality: 'low-quality', value: null, reason: 'Relative torso motion below prototype 0.05px RMS resolution gate', metrics: { relativeMotionRmsPx } };
            const e = estimateBreathing(s);
            return { ...e, value: e.breathsPerMin, metrics: { ...e.metrics, relativeMotionRmsPx } };
        } });
}
