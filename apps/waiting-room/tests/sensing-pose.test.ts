import { describe, expect, it } from 'vitest';
import { createPoseProcessor, extractPose, resetPoseReference } from '../client/sensing/pose.ts';
import type { PoseLandmark } from '../client/sensing/pose.ts';
import type { BoundFrame, ReferenceControl, SensorContext } from '../shared/contracts.ts';
import { poseInputSchema } from '../shared/schemas.ts';
const control: ReferenceControl = { trackId: 'track', visitId: 'visit', identityEpoch: 'epoch', generation: 1 };
function context(): SensorContext { let seq = 0; return { sourceId: 'camera', runId: 'run', getSyncId: () => 'sync', nextSeq: () => ++seq }; }
function frame(t: number): BoundFrame { return { frame: { runId: 'run', seq: Math.round(t) + 1, sourceAtMs: t, monotonicMs: t, width: 640, height: 480, image: {} as ImageBitmap }, binding: { trackId: 'track', visitId: 'visit', identityEpoch: 'epoch', state: 'matched', sourceSinceAtMs: 0, sourceLastVerifiedAtMs: t, bounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 }, observedLocation: null }, faceSkin: [], identityStamp: { frameSeq: Math.round(t) + 1, sourceAtMs: t, identityEpoch: 'epoch' }, poseStamp: null, torso: null, selectedPersonCount: 1, poseMotion: null, faceMotionWidthsPerSecond: 0, associationUsable: true, invalidReason: null }; }
function landmarks(droop = 0, translation = 0): PoseLandmark[] {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1, presence: 1 }));
    p[0] = { ...p[0], x: 0.5, y: 0.15 + droop };
    for (const [i, x, y, z] of [[11, 0.3, 0.3, 0], [12, 0.7, 0.3, 0], [23, 0.38, 0.65, 0], [24, 0.62, 0.65, 0], [25, 0.38, 0.72, -0.2], [26, 0.62, 0.72, -0.2], [27, 0.38, 0.95, -0.2], [28, 0.62, 0.95, -0.2]])
        p[i] = { ...p[i], x: x + translation, y, z };
    return p;
}
describe('pose features and reference generation', () => {
    it('emits a transport-valid pose rather than an ID the backend rejects',()=>{
        const c=context();c.sourceId='s'.repeat(96);c.runId='r'.repeat(96);
        const f=frame(100);f.frame.runId=c.runId;
        const observation=createPoseProcessor().process(f,control,c,[landmarks()]).observation;
        expect(observation).not.toBeNull();
        expect(poseInputSchema.safeParse(observation).success).toBe(true);
    });
    it('requires ten continuous seconds before relative slump qualification', () => {
        const p = createPoseProcessor(), c = context();
        let result;
        for (let t = 0; t <= 9900; t += 100)
            result = p.process(frame(t), control, c, [landmarks()]);
        const poseAfter9999ms = p.process(frame(9999), control, c, [landmarks()]).observation!;
        expect(poseAfter9999ms.referenceReady).toBe(false);
        const poseAfter10000ms = p.process(frame(10000), control, c, [landmarks()]).observation!;
        expect(poseAfter10000ms.referenceReady).toBe(true);
        expect(poseAfter10000ms.seated).toBe(true);
        result = p.process(frame(10100), control, c, [landmarks(0.07)]);
        expect(result.observation?.qualifyingSlump).toBe(true);
        expect(result.observation?.activity).toBe('stationary');
        expect(result.poseMotion).toBeCloseTo(0);
        expect(result.torso).not.toBeNull();
    });
    it.each(['hips', 'visibility', 'multiple', 'epoch', 'standing', 'movement'] as const)('does not arm a reference from %s geometry', kind => {
        const p = createPoseProcessor(), c = context(), f = frame(100), points = landmarks();
        p.process(frame(0), control, c, [landmarks()]);
        if (kind === 'hips')
            points[23].visibility = 0;
        if (kind === 'visibility')
            points[0].visibility = 0.69;
        if (kind === 'epoch')
            f.binding!.identityEpoch = 'other';
        if (kind === 'standing') {
            for (const [k, y] of [[25, 0.8], [26, 0.8], [27, 0.95], [28, 0.95]])
                points[k] = { ...points[k], y, z: 0 };
        }
        const result = p.process(f, control, c, kind === 'multiple' ? [points, points] : [kind === 'movement' ? landmarks(0, 0.1) : points]);
        expect(result.observation?.qualifyingSlump).toBe(false);
        expect(result.observation?.referenceReady).toBe(false);
        if (kind === 'hips' || kind === 'visibility' || kind === 'multiple' || kind === 'epoch')
            expect(result.observation?.quality).not.toBe('usable');
        if (kind === 'movement')
            expect(result.observation?.activity).toBe('moving');
        if (kind === 'standing')
            expect(result.observation?.seated).not.toBe(true);
    });
    it('missing time does not complete an unfinished reference', () => {
        const p = createPoseProcessor(), c = context();
        for (let t = 0; t <= 9000; t += 100)
            p.process(frame(t), control, c, [landmarks()]);
        const r = p.process(frame(11000), control, c, [landmarks()]);
        expect(r.observation?.referenceReady).toBe(false);
        expect(r.observation?.qualifyingSlump).toBe(false);
    });
    it('checked generation resets once; stale generation cannot restore old reference', () => {
        const p = createPoseProcessor(), c = context();
        for (let t = 0; t <= 10000; t += 100)
            p.process(frame(t), control, c, [landmarks()]);
        expect(p.process(frame(10100), control, c, [landmarks(0.07)]).observation?.qualifyingSlump).toBe(true);
        const checkedControl = { ...control, generation: 2 };
        p.reset(checkedControl);
        expect(p.process(frame(10200), control, c, [landmarks()]).observation?.quality).not.toBe('usable');
        p.process(frame(10300), checkedControl, c, [landmarks()]);
        for (let t = 10400; t < 20300; t += 100) {
            p.reset(checkedControl);
            p.process(frame(t), checkedControl, c, [landmarks()]);
        }
        expect(p.process(frame(20299), checkedControl, c, [landmarks()]).observation?.referenceReady).toBe(false);
        expect(p.process(frame(20300), checkedControl, c, [landmarks()]).observation?.referenceReady).toBe(true);
    });
    it('marks invalid leg geometry unknown and rejects out-of-order inference', () => { const p = createPoseProcessor(), c = context(), a = landmarks(); a[25].visibility = 0.2; expect(p.process(frame(100), control, c, [a]).observation?.seated).toBeNull(); expect(p.process(frame(50), control, c, [landmarks()]).observation?.quality).not.toBe('usable'); });
    it('a missing clock has no transmissible observation', () => { const p = createPoseProcessor(), c = { ...context(), getSyncId: () => null }; expect(p.process(frame(0), control, c, [landmarks()]).observation).toBeNull(); });
    it('uninitialized real model reports unavailable without touching a camera', async () => { resetPoseReference(control); const r = await extractPose(frame(0), control, context()); expect(r.observation?.quality).toBe('unavailable'); expect(r.observation?.qualifyingSlump).toBe(false); });
});
it('torso output cannot enable respiration when seated pose quality is unknown', () => {
    const p = createPoseProcessor(), c = context(), points = landmarks();
    points[25].visibility = 0;
    p.process(frame(0), control, c, [points]);
    const result = p.process(frame(100), control, c, [points]);
    expect(result.observation?.quality).toBe('low-quality');
    expect(result.torso).toBeNull();
});
it('an initially drooped head cannot silently become an upright reference', () => {
    const p = createPoseProcessor(), c = context();
    let result;
    for (let t = 0; t <= 10000; t += 100)
        result = p.process(frame(t), control, c, [landmarks(0.16)]);
    expect(result?.observation?.referenceReady).toBe(false);
    expect(result?.observation?.reason).toMatch(/upright/i);
});
