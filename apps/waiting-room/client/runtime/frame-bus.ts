import type { BoundFrame, FramePacket, MetadataStamp } from '../../shared/contracts.ts';
type Listener = (frame: BoundFrame) => void;
export function createFrameBus(onError: (error: unknown) => void = () => {}) {
  const listeners = new Set<Listener>();
  let publishing = false;
  return {
    subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** All listeners borrow the bitmap synchronously; it closes even if a listener fails. */
    publish(frame: BoundFrame) {
      if (publishing) throw new Error('Recursive frame publication is not allowed');
      publishing = true;
      try { for (const listener of [...listeners]) { try { listener(frame); } catch (e) { onError(e); } } }
      finally { publishing = false; frame.frame.image.close(); }
    },
  };
}
const stationBus = createFrameBus();
export const subscribeBoundFrames = stationBus.subscribe;
export const publishBoundFrame = stationBus.publish;
export function createStreamAllocators() {
  const next = new Map<string, () => number>();
  return (stream: 'phone'|'rppg'|'breathing'|'pose'|'binding') => {
    if (!next.has(stream)) { let seq = 0; next.set(stream, () => ++seq); }
    return next.get(stream)!;
  };
}
export function metadataEligibility(frame: BoundFrame): { identity: boolean; pose: boolean } {
  const stampValid = (stamp: MetadataStamp | null, maxAge: number) => !!stamp && stamp.identityEpoch === frame.binding?.identityEpoch && stamp.frameSeq <= frame.frame.seq && stamp.sourceAtMs <= frame.frame.sourceAtMs && frame.frame.sourceAtMs - stamp.sourceAtMs <= maxAge;
  const identity = frame.associationUsable && frame.invalidReason === null && frame.selectedPersonCount === 1 && frame.binding?.state === 'matched' && frame.binding.visitId !== null && stampValid(frame.identityStamp, 500);
  return { identity, pose: identity && !!frame.torso && stampValid(frame.poseStamp, 250) };
}
/** Takes ownership of dedicated inference bitmaps. Never submit a borrowed bus bitmap.
 * One inference call in flight; the newest owned pending frame replaces the old one.
 * A future camera producer must clone/transfer independently of synchronous ROI sampling.
 */
export function createInferenceScheduler<R>(opts: { infer: (frame: FramePacket) => Promise<R>; onResult: (value: R, frame: FramePacket, epoch: string) => void; onError?: (error: unknown) => void; now: () => number; maxAgeMs: number }) {
  type Work = { frame: FramePacket; epoch: string; generation: number };
  let generation = 0, disposed = false, busy = false;
  let pending: Work | null = null, runId: string | null = null, epoch: string | null = null, latestSeq = -1;
  const fresh = (f: FramePacket) => opts.now() >= f.sourceAtMs && opts.now() - f.sourceAtMs <= opts.maxAgeMs;
  function invalidate() { generation++; pending?.frame.image.close(); pending = null; latestSeq = -1; }
  async function execute(work: Work) {
    busy = true;
    try {
      if (fresh(work.frame)) {
        const value = await opts.infer(work.frame);
        if (!disposed && work.generation === generation && fresh(work.frame)) opts.onResult(value, work.frame, work.epoch);
      }
    } catch (e) { if (!disposed && work.generation === generation) opts.onError?.(e); }
    finally { work.frame.image.close(); busy = false; const next = pending; pending = null; if (next && !disposed) void execute(next); }
  }
  return {
    submit(frame: FramePacket, identityEpoch: string) {
      if (disposed) { frame.image.close(); return; }
      if (frame.runId !== runId || epoch !== identityEpoch) { invalidate(); runId = frame.runId; epoch = identityEpoch; }
      if (frame.seq <= latestSeq || !fresh(frame)) { frame.image.close(); return; }
      latestSeq = frame.seq;
      const work = { frame, epoch: identityEpoch, generation };
      if (busy) { pending?.frame.image.close(); pending = work; } else void execute(work);
    },
    invalidate,
    dispose() { disposed = true; invalidate(); },
  };
}
export type InferenceRequest = { id: number; kind: 'identity'|'pose'; frame: FramePacket };
export type InferenceResponse = { id: number; frameSeq: number; runId: string; sourceAtMs: number; status: 'unavailable'; reason: string };
/** Worker adapter seam; worker intentionally reports unavailable until licensed models are integrated. */
export function createInferenceWorkerTransport(worker: Worker) {
  let id = 0;
  let pending: { id: number; resolve: (response: InferenceResponse) => void; reject: (reason: Error) => void } | null = null;
  const message = (event: MessageEvent<InferenceResponse>) => { if (pending && event.data.id === pending.id) { pending.resolve(event.data); pending = null; } };
  const error = () => { pending?.reject(new Error('Inference worker failed')); pending = null; };
  worker.addEventListener('message', message); worker.addEventListener('error', error);
  return {
    infer(frame: FramePacket, kind: InferenceRequest['kind']): Promise<InferenceResponse> {
      if (pending) return Promise.reject(new Error('One worker inference at a time'));
      return new Promise((resolve, reject) => { const nextId = ++id; pending = { id: nextId, resolve, reject }; try { worker.postMessage({ id: nextId, kind, frame } satisfies InferenceRequest, [frame.image]); } catch (e) { pending = null; reject(e); } });
    },
    dispose() { error(); worker.removeEventListener('message', message); worker.removeEventListener('error', error); worker.terminate(); },
  };
}
