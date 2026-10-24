import type { BoundFrame, Measurement, Quality, SensorContext, SensorRuntime } from '../../shared/contracts.ts';
import { metadataEligibility } from '../runtime/frame-bus.ts';
export type MeasurementEmitter = (m: Omit<Measurement, 'alignedStartAtMs' | 'alignedEndAtMs' | 'receivedAtMs'>) => void;
type RuntimeFrame = {
    frame: Omit<BoundFrame['frame'], 'image'>;
    binding: BoundFrame['binding'];
};
export type Extraction<T> = {
    sample: T | null;
    reason: string | null;
    metrics?: Record<string, number>;
};
export function createSignalRuntime<T extends {
    tMs: number;
}>(context: SensorContext, emit: MeasurementEmitter, options: {
    stream: 'rppg' | 'breathing';
    getContinuityKey?: () => string | null;
    durationMs: number;
    clear: () => void;
    extract: (f: BoundFrame) => Extraction<T>;
    estimate: (s: T[]) => {
        quality: Quality;
        value: number | null;
        reason: string | null;
        metrics: Record<string, number>;
    };
}): SensorRuntime {
    let samples: T[] = [], disposed = false, key: string | null = null, last: RuntimeFrame | null = null, lastEmit = -Infinity, lastQuality: Quality | null = null;
    const output = (f: RuntimeFrame, quality: Quality, value: number | null, reason: string | null, metrics: Record<string, number>, start = f.frame.sourceAtMs) => {
        const syncId = context.getSyncId();
        if (!syncId || f.frame.runId !== context.runId)
            return;
        const seq = context.nextSeq(), binding = f.binding;
        emit({ schemaVersion: 1, id: crypto.randomUUID(), sourceId: context.sourceId, runId: context.runId, seq, syncId, streamId: options.stream, channel: options.stream === 'rppg' ? 'pulse' : 'breathing', method: options.stream === 'rppg' ? 'camera-pos' : 'camera-torso-motion', trackId: binding?.trackId ?? null, visitId: binding?.visitId ?? null, identityEpoch: binding?.identityEpoch ?? null, captureId: null, sourceStartAtMs: start, sourceEndAtMs: f.frame.sourceAtMs, quality, value, unit: options.stream === 'rppg' ? 'bpm' : 'breaths/min', provenance: 'live_camera', reason, metrics });
        lastEmit = f.frame.sourceAtMs;
        lastQuality = quality;
    };
    const clear = () => { samples = []; options.clear(); };
    const reject = (f: BoundFrame, reason: string, metrics: Record<string, number> = {}) => { clear(); output(f, 'low-quality', null, reason, metrics); };
    return {
        push(f) {
            if (disposed)
                return;
            const sync = context.getSyncId(), eligible = metadataEligibility(f), currentKey = JSON.stringify([context.sourceId, f.frame.runId, options.getContinuityKey?.() ?? sync, f.binding?.trackId, f.binding?.visitId, f.binding?.identityEpoch]);
            if (!sync) {
                clear();
                key = null;
                last = null;
                return;
            }
            if (f.frame.runId !== context.runId) {
                clear();
                key = null;
                last = null;
                return;
            }
            if (!Number.isFinite(f.frame.sourceAtMs) || !Number.isFinite(f.frame.monotonicMs) || f.frame.width <= 0 || f.frame.height <= 0) {
                clear();
                return;
            }
            let discontinuity: string | null = null;
            if (key !== null && key !== currentKey)
                discontinuity = 'Identity, visit, track, run or clock mapping changed';
            if (last && key === currentKey) {
                const dt = f.frame.sourceAtMs - last.frame.sourceAtMs, mono = f.frame.monotonicMs - last.frame.monotonicMs;
                if (f.frame.seq <= last.frame.seq || dt <= 0 || mono <= 0)
                    discontinuity = 'Out-of-order or reused camera frame';
                else if (dt > 200)
                    discontinuity = 'Camera sample gap exceeds 200 ms';
                else if (Math.abs(dt - mono) > 50)
                    discontinuity = 'Source clock discontinuity';
                else if (f.frame.width !== last.frame.width || f.frame.height !== last.frame.height)
                    discontinuity = 'Camera geometry changed';
            }
            key = currentKey;
            const { image: _borrowed, ...metadata } = f.frame;
            last = { frame: metadata, binding: f.binding ? { ...f.binding } : null };
            if (discontinuity) {
                reject(f, discontinuity);
                return;
            }
            if (!eligible.identity) {
                reject(f, f.invalidReason ?? 'Identity association unavailable or expired');
                return;
            }
            if (options.stream === 'rppg' && (f.faceMotionWidthsPerSecond === null || !Number.isFinite(f.faceMotionWidthsPerSecond) || f.faceMotionWidthsPerSecond < 0 || f.faceMotionWidthsPerSecond >= 0.75)) {
                reject(f, 'Face motion unavailable or excessive');
                return;
            }
            if (options.stream === 'breathing' && (!eligible.pose || f.poseMotion === null || !Number.isFinite(f.poseMotion) || f.poseMotion < 0 || f.poseMotion > 0.15)) {
                reject(f, 'Fresh stationary torso pose unavailable');
                return;
            }
            let extracted: Extraction<T>;
            try {
                extracted = options.extract(f);
            }
            catch {
                reject(f, 'Camera pixels unavailable');
                return;
            }
            if (!extracted.sample) {
                reject(f, extracted.reason ?? 'Image quality unavailable', extracted.metrics);
                return;
            }
            samples.push(extracted.sample);
            while (samples.length > 1 && f.frame.sourceAtMs - samples[1].tMs >= options.durationMs)
                samples.shift();
            const duration = f.frame.sourceAtMs - samples[0].tMs;
            if (duration < options.durationMs - 1e-6) {
                if (lastQuality !== 'collecting' || f.frame.sourceAtMs - lastEmit >= 2000)
                    output(f, 'collecting', null, `Collect ${options.durationMs / 1000} seconds of usable ${options.stream === 'rppg' ? 'face color' : 'torso motion'}`, { ...extracted.metrics, usableDurationMs: duration });
                return;
            }
            if (f.frame.sourceAtMs - lastEmit < 2000 && lastQuality === 'usable')
                return;
            const estimate = options.estimate(samples);
            output(f, estimate.quality, estimate.value, estimate.reason, { ...extracted.metrics, ...estimate.metrics }, estimate.value === null ? f.frame.sourceAtMs : samples[0].tMs);
            if (estimate.value === null)
                clear();
        },
        reset(reason) { if (disposed)
            return; clear(); if (last)
            output(last, 'unavailable', null, reason, {}); key = null; last = null; lastQuality = null; lastEmit = -Infinity; },
        dispose() { if (disposed)
            return; clear(); if (last)
            output(last, 'unavailable', null, 'Sensing stopped', {}); disposed = true; last = null; key = null; },
    };
}
