import { expect, it } from 'vitest';
import { createFrameBus, createStreamAllocators, createInferenceScheduler, metadataEligibility } from '../client/runtime/frame-bus.ts';
import type { BoundFrame, FramePacket } from '../shared/contracts.ts';
function packet(seq: number, sourceAtMs = seq * 10): FramePacket & { closed: () => boolean } {
  let closed = false;
  return { runId: 'run_1', seq, sourceAtMs, monotonicMs: sourceAtMs, width: 640, height: 480, image: { close: () => { closed = true; } } as ImageBitmap, closed: () => closed };
}
function bound(frame: FramePacket): BoundFrame { return { frame, binding: { trackId: 'track_1', visitId: 'visit_1', identityEpoch: 'epoch_1', state: 'matched', bounds: { x: 0, y: 0, width: 1, height: 1 }, sourceSinceAtMs: 0, sourceLastVerifiedAtMs: frame.sourceAtMs, observedLocation: null }, faceSkin: [], identityStamp: { frameSeq: 1, sourceAtMs: 1000, identityEpoch: 'epoch_1' }, poseStamp: { frameSeq: 1, sourceAtMs: 1250, identityEpoch: 'epoch_1' }, torso: { x: 0, y: 0, width: 1, height: 1 }, selectedPersonCount: 1, poseMotion: 0, faceMotionWidthsPerSecond: 0, associationUsable: true, invalidReason: null }; }
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
it('borrows the bitmap only during synchronous consumers and closes despite consumer failure', () => {
  const errors: unknown[] = []; const bus = createFrameBus(e => errors.push(e)); const p = packet(1); const seen: boolean[] = [];
  bus.subscribe(f => { seen.push(p.closed()); expect(f.frame).toBe(p); throw new Error('consumer'); });
  const unsub = bus.subscribe(() => seen.push(p.closed())); bus.publish(bound(p));
  expect(seen).toEqual([false,false]); expect(p.closed()).toBe(true); expect(errors).toHaveLength(1);
  unsub(); const p2 = packet(2); bus.publish(bound(p2)); expect(seen).toHaveLength(3); expect(p2.closed()).toBe(true);
});
it('allocates independent monotonic observation sequences per stream', () => {
  const alloc = createStreamAllocators();
  expect([alloc('pose')(), alloc('rppg')(), alloc('breathing')(), alloc('pose')()]).toEqual([1,1,1,2]);
});
it('bounds slow model work to one in flight and one latest pending, disposing replaced frames', async () => {
  const frames = [packet(1),packet(2),packet(3)]; const started: number[] = []; const delivered: number[] = [];
  const resolve: Array<(v:number)=>void> = [];
  const scheduler = createInferenceScheduler<number>({ now: () => 100, maxAgeMs: 500, infer: f => { started.push(f.seq); return new Promise(r => resolve.push(r)); }, onResult: value => delivered.push(value) });
  frames.forEach(f => scheduler.submit(f, 'epoch_1'));
  expect(started).toEqual([1]); expect(frames[1].closed()).toBe(true);
  resolve[0](1); await tick(); expect(started).toEqual([1,3]); expect(frames[0].closed()).toBe(true);
  resolve[1](3); await tick(); expect(delivered).toEqual([1,3]); expect(frames[2].closed()).toBe(true); scheduler.dispose();
});
it('discards expired and old epoch results, handles rejection, and closes after disposal', async () => {
  let now = 0; let finish!: (v:string)=>void; const delivered: string[] = []; const errors: unknown[] = [];
  const scheduler = createInferenceScheduler<string>({ now: () => now, maxAgeMs: 500, infer: () => new Promise(r => { finish = r; }), onResult: v => delivered.push(v), onError: e => errors.push(e) });
  const first = packet(1,0); scheduler.submit(first,'epoch_1'); now = 501; finish('stale'); await tick(); expect(delivered).toEqual([]); expect(first.closed()).toBe(true);
  scheduler.submit(packet(2,501),'epoch_1'); scheduler.invalidate(); finish('old epoch'); await tick(); expect(delivered).toEqual([]);
  scheduler.dispose(); const last = packet(3,501); scheduler.submit(last,'epoch_2'); expect(last.closed()).toBe(true);
  const failing = createInferenceScheduler({ now: () => 0, maxAgeMs: 500, infer: async () => { throw new Error('model failed'); }, onResult: () => {}, onError: e => errors.push(e) });
  const p = packet(1,0); failing.submit(p,'epoch_1'); await tick(); expect(p.closed()).toBe(true); expect(errors).toHaveLength(1); failing.dispose();
});
it('invalidates metadata by actual inference frame time, epoch, candidate count and future stamps', () => {
  const f = bound(packet(20,1500)); expect(metadataEligibility(f)).toEqual({ identity: true, pose: true });
  expect(metadataEligibility({ ...f, frame: packet(21,1501) })).toEqual({ identity: false, pose: false });
  expect(metadataEligibility({ ...f, poseStamp: { ...f.poseStamp!, sourceAtMs: 1249 } })).toEqual({ identity: true, pose: false });
  expect(metadataEligibility({ ...f, identityStamp: { ...f.identityStamp!, identityEpoch: 'old' } }).identity).toBe(false);
  expect(metadataEligibility({ ...f, selectedPersonCount: 2 }).identity).toBe(false);
  expect(metadataEligibility({ ...f, identityStamp: { ...f.identityStamp!, sourceAtMs: 1501 } }).identity).toBe(false);
});
