import { describe, expect, it } from 'vitest';
import type { BoundFrame, Measurement, SensorContext } from '../shared/contracts.ts';
import { createRppgRuntime } from '../client/sensing/rppg.ts';
import { createBreathingRuntime } from '../client/sensing/breathing.ts';
import { sampleFaceRgb } from '../client/sensing/pixels.ts';
import type { PixelPlane } from '../client/sensing/pixels.ts';
import { estimatePatchDisplacement } from '../client/sensing/motion.ts';
import { measurementInputSchema } from '../shared/schemas.ts';
function image(width = 160, height = 160, shift = 0, brightness = 0): PixelPlane {
    const data = new Uint8ClampedArray(width * height * 4);
    // Analytic nonrepeating texture, continuous in y for true subpixel translations.
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const v = 128 + brightness + 28 * Math.sin(x * 0.91 + (y - shift) * 0.37) + 24 * Math.cos(x * 0.29 - (y - shift) * 1.13) + 18 * Math.sin(x * 1.77 + (y - shift) * 1.61);
            const i = (y * width + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = v;
            data[i + 3] = 255;
        }
    return { width, height, data };
}
function localImage(shift: number): PixelPlane {
    const base = image(), moved = image(160, 160, shift);
    for (let y = 32; y < 128; y++)
        for (let x = 32; x < 128; x++) {
            const k = (y * 160 + x) * 4;
            for (let c = 0; c < 3; c++)
                base.data[k + c] = moved.data[k + c];
        }
    return base;
}
function frame(tMs = 0, seq = 1, plane = image()): BoundFrame {
    return { frame: { runId: 'run', seq, sourceAtMs: tMs, monotonicMs: tMs, width: plane.width, height: plane.height, image: plane as unknown as ImageBitmap }, binding: { trackId: 'track', visitId: 'visit', identityEpoch: 'epoch', state: 'matched', sourceSinceAtMs: 0, sourceLastVerifiedAtMs: tMs, bounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 }, observedLocation: null }, faceSkin: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }], identityStamp: { frameSeq: seq, sourceAtMs: tMs, identityEpoch: 'epoch' }, poseStamp: { frameSeq: seq, sourceAtMs: tMs, identityEpoch: 'epoch' }, torso: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, selectedPersonCount: 1, poseMotion: 0, faceMotionWidthsPerSecond: 0, associationUsable: true, invalidReason: null };
}
function setup() { let seq = 0, sync: string | null = 'sync'; const out: Omit<Measurement, 'alignedStartAtMs' | 'alignedEndAtMs' | 'receivedAtMs'>[] = []; const context: SensorContext = { sourceId: 'camera', runId: 'run', getSyncId: () => sync, nextSeq: () => ++seq }; return { context, out, emit: (v: typeof out[number]) => out.push(v), setSync: (v: string | null) => { sync = v; } }; }
const reader = { readPixels: (f: BoundFrame) => f.frame.image as unknown as PixelPlane };
describe('real image extraction independent of scalar DSP', () => {
    it('reports actual face means and fraction of clipped pixels', () => { const p = image(); p.data.fill(255); const sample = sampleFaceRgb(p, frame().faceSkin, 3); expect(sample?.r).toBe(1); expect(sample?.saturationFraction.g).toBe(1); expect(sample?.tMs).toBe(3); expect(sampleFaceRgb(p, [{ x: -1, y: 0, width: 1, height: 1 }], 0)).toBeNull(); });
    it('recovers subpixel vertical translation from textured patches', () => { const a = image(), b = image(160, 160, 0.35); const result = estimatePatchDisplacement(a, b, [{ x: 55, y: 55 }]); expect(result.reason).toBeNull(); expect(result.dy).toBeCloseTo(0.35, 1); });
    it('rejects low texture, exposure jumps and search-boundary motion', () => {
        const flat = image();
        flat.data.fill(120);
        expect(estimatePatchDisplacement(flat, flat, [{ x: 55, y: 55 }]).dy).toBeNull();
        expect(estimatePatchDisplacement(image(), image(160, 160, 0, 35), [{ x: 55, y: 55 }]).dy).toBeNull();
        expect(estimatePatchDisplacement(image(), image(160, 160, 4), [{ x: 55, y: 55 }]).dy).toBeNull();
    });
});
describe('bound frame runtimes', () => {
    it('emits transport-valid observations even with maximum-length source and run IDs',()=>{
        const s=setup();s.context.sourceId='s'.repeat(96);s.context.runId='r'.repeat(96);
        const runtime=createRppgRuntime(s.context,s.emit,reader);
        const f=frame();f.frame.runId=s.context.runId;runtime.push(f);
        expect(s.out.length).toBeGreaterThan(0);
        for(const value of s.out)expect(measurementInputSchema.safeParse(value).success).toBe(true);
        runtime.dispose();
    });
    it.each(['identity', 'epoch', 'pose', 'motion', 'roi', 'run', 'sync', 'gap', 'clock'] as const)('nulls and resets breathing on %s disqualification', kind => {
        const s = setup(), runtime = createBreathingRuntime(s.context, s.emit, reader);
        runtime.push(frame());
        const f = frame(40, 2);
        if (kind === 'identity')
            f.associationUsable = false;
        if (kind === 'epoch')
            f.binding!.identityEpoch = 'next';
        if (kind === 'pose')
            f.poseStamp!.sourceAtMs = -500;
        if (kind === 'motion')
            f.poseMotion = 0.2;
        if (kind === 'roi')
            f.torso = { x: 0, y: 0, width: 0.1, height: 0.1 };
        if (kind === 'run')
            f.frame.runId = 'other';
        if (kind === 'sync')
            s.setSync('next');
        if (kind === 'gap')
            f.frame.sourceAtMs = f.frame.monotonicMs = 300;
        if (kind === 'clock')
            f.frame.sourceAtMs = 120;
        const count = s.out.length;
        runtime.push(f);
        if (kind === 'run') {
            expect(s.out).toHaveLength(count);
            runtime.push(frame(80, 3));
            expect(s.out.at(-1)?.metrics.usableDurationMs).toBe(0);
        }
        else {
            expect(s.out).toHaveLength(count + 1);
            expect(s.out.at(-1)?.quality).toBe('low-quality');
        }
        if (kind === 'clock')
            expect(s.out.at(-1)?.reason).toMatch(/clock discontinuity/i);
        expect(s.out.at(-1)?.value).toBeNull();
        expect(s.out.at(-1)?.reason).toBeTruthy();
        expect(s.out.at(-1)?.sourceStartAtMs).toBe(s.out.at(-1)?.sourceEndAtMs);
        runtime.dispose();
    });
    it('does not manufacture breathing from ROI jitter on a static image', () => {
        const s = setup(), runtime = createBreathingRuntime(s.context, s.emit, reader), p = image();
        for (let i = 0; i <= 900; i++) {
            const f = frame(i * 50, i + 1, p);
            f.torso!.x += Math.sin(i / 20) * 0.008;
            runtime.push(f);
        }
        expect(s.out.some(m => m.value !== null)).toBe(false);
        expect(s.out.at(-1)?.quality).toBe('low-quality');
    });
    it('extracts a subpixel respiratory oscillation from image frames', () => {
        const s = setup(), runtime = createBreathingRuntime(s.context, s.emit, reader);
        for (let i = 0; i <= 900; i++)
            runtime.push(frame(i * 50, i + 1, localImage(0.55 * Math.sin(2 * Math.PI * 0.25 * i / 20))));
        const usable = s.out.filter(m => m.value !== null);
        expect(usable.length).toBeGreaterThan(0);
        expect(usable.at(-1)!.value).toBeCloseTo(15, 0);
        expect(usable.at(-1)!.method).toBe('camera-torso-motion');
    }, 20000);
    it('rPPG emits measured 30s interval then immediately nulls on uncertainty', () => {
        const s = setup(), runtime = createRppgRuntime(s.context, s.emit, reader);
        for (let i = 0; i <= 900; i++) {
            const p = image(40, 40), w = Math.sin(2 * Math.PI * 1.2 * i / 30);
            for (let k = 0; k < p.data.length; k += 4) {
                p.data[k] = 128 + w * 2;
                p.data[k + 1] = 100 + w * 5;
                p.data[k + 2] = 80 + w;
            }
            const f = frame(i * 1000 / 30, i + 1, p);
            f.faceSkin = [{ x: 0, y: 0, width: 1, height: 1 }];
            runtime.push(f);
        }
        const usable = s.out.filter(m => m.value !== null);
        expect(usable.length).toBeGreaterThan(0);
        expect(usable.at(-1)!.value).toBeCloseTo(72, 0);
        expect(usable.at(-1)!.sourceStartAtMs).toBe(0);
        expect(usable.at(-1)!.sourceEndAtMs).toBe(30000);
        const f = frame(30040, 902);
        f.binding!.state = 'uncertain';
        runtime.push(f);
        expect(s.out.at(-1)?.value).toBeNull();
        expect(s.out.at(-1)?.quality).not.toBe('usable');
    });
    it('no valid clock means no submitted observation; disposal cannot emit', () => { const s = setup(); s.setSync(null); const r = createRppgRuntime(s.context, s.emit, reader); r.push(frame()); expect(s.out).toHaveLength(0); s.setSync('sync'); r.push(frame(50, 2)); expect(s.out.at(-1)?.value).toBeNull(); r.dispose(); const count = s.out.length; r.push(frame(100, 3)); expect(s.out).toHaveLength(count); });
});
describe('camera motion and window isolation regressions', () => {
    it.each(['global', 'below-resolution'] as const)('does not report breathing for %s motion', kind => {
        const s = setup(), runtime = createBreathingRuntime(s.context, s.emit, reader);
        for (let i = 0; i <= 900; i++) {
            const w = Math.sin(2 * Math.PI * 0.25 * i / 20), p = kind === 'global' ? image(160, 160, 0.55 * w) : localImage(0.01 * w);
            const f = frame(i * 50, i + 1, p);
            f.torso = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
            runtime.push(f);
        }
        expect(s.out.filter(m => m.value !== null)).toEqual([]);
    }, 20000);
    it('cannot bridge a face identity change with the preceding pulse window', () => {
        const s = setup(), runtime = createRppgRuntime(s.context, s.emit, reader);
        function push(t: number, epoch = 'epoch') { const p = image(40, 40), w = Math.sin(2 * Math.PI * 1.2 * t / 1000); for (let k = 0; k < p.data.length; k += 4) {
            p.data[k] = 128 + w * 2;
            p.data[k + 1] = 100 + w * 5;
            p.data[k + 2] = 80 + w;
        } const f = frame(t, Math.round(t) + 1, p); f.faceSkin = [{ x: 0, y: 0, width: 1, height: 1 }]; f.binding!.identityEpoch = epoch; f.identityStamp!.identityEpoch = epoch; runtime.push(f); }
        for (let i = 0; i <= 900; i++)
            push(i * 1000 / 30);
        expect(s.out.at(-1)?.value).not.toBeNull();
        push(30040, 'new-epoch');
        expect(s.out.at(-1)?.value).toBeNull();
        for (let i = 1; i <= 895; i++)
            push(30040 + i * 1000 / 30, 'new-epoch');
        expect(s.out.filter(m => m.identityEpoch === 'new-epoch' && m.value !== null)).toHaveLength(0);
    });
});
it.each(['stale-identity', 'head-motion', 'clipped', 'exposure', 'roi', 'pixels'] as const)('rPPG rejects %s immediately without carrying a current value', kind => {
    const s = setup();
    let broken = false;
    const runtime = createRppgRuntime(s.context, s.emit, { readPixels: f => { if (broken)
            throw new Error('unavailable pixels'); return reader.readPixels(f); } });
    runtime.push(frame());
    const f = frame(50, 2);
    if (kind === 'stale-identity')
        f.identityStamp!.sourceAtMs = -1000;
    if (kind === 'head-motion')
        f.faceMotionWidthsPerSecond = 0.75;
    if (kind === 'clipped')
        (f.frame.image as unknown as PixelPlane).data.fill(255);
    if (kind === 'exposure')
        f.frame.image = image(160, 160, 0, 40) as unknown as ImageBitmap;
    if (kind === 'roi')
        f.faceSkin = [{ x: -0.1, y: 0, width: 1, height: 1 }];
    if (kind === 'pixels')
        broken = true;
    runtime.push(f);
    expect(s.out.at(-1)?.quality).toBe('low-quality');
    expect(s.out.at(-1)?.value).toBeNull();
    expect(s.out.at(-1)?.sourceStartAtMs).toBe(50);
    expect(s.out.at(-1)?.sourceEndAtMs).toBe(50);
});
