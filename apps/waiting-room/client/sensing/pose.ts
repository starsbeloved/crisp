import type { BoundFrame, Bounds, PoseFrameResult, PoseObservation, ReferenceControl, SensorContext } from '../../shared/contracts.ts';
import { metadataEligibility } from '../runtime/frame-bus.ts';
import { median } from './dsp.ts';
import { validBounds } from './pixels.ts';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
export const POSE_THRESHOLDS = { visibility: 0.7, referenceMs: 10000, gapMs: 1000, motionWidthsPerSecond: 0.15, headDescentWidths: 0.12, torsoAngleChangeDeg: 15, referenceTorsoAngleDeg: 20 } as const;
export type PoseLandmark = {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
    presence?: number;
};
type Geometry = {
    head: number;
    angle: number;
    width: number;
    torso: Bounds;
    points: {
        x: number;
        y: number;
    }[];
    seated: boolean | null;
};
type State = {
    control: ReferenceControl;
    key: string | null;
    lastAt: number | null;
    lastMono: number | null;
    lastSeq: number;
    previous: Geometry | null;
    referenceStart: number | null;
    reference: {
        head: number;
        angle: number;
    }[];
    baseline: {
        head: number;
        angle: number;
    } | null;
};
const newState = (control: ReferenceControl): State => ({ control: { ...control }, key: null, lastAt: null, lastMono: null, lastSeq: -1, previous: null, referenceStart: null, reference: [], baseline: null });
const sameControl = (a: ReferenceControl, b: ReferenceControl) => a.trackId === b.trackId && a.visitId === b.visitId && a.identityEpoch === b.identityEpoch && a.generation === b.generation;
const pointGood = (p: PoseLandmark | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && (p.visibility ?? 0) >= 0.7 && (p.presence ?? 1) >= 0.7;
function geometry(p: PoseLandmark[], f: BoundFrame): Geometry | null {
    if (![0, 11, 12, 23, 24].every(i => pointGood(p[i])))
        return null;
    const W = f.frame.width, H = f.frame.height, points = [11, 12, 23, 24].map(i => ({ x: p[i].x * W, y: p[i].y * H }));
    const shoulder = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }, hip = { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 };
    const width = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    if (width < 20 || hip.y - shoulder.y < 10)
        return null;
    const xs = points.map(v => v.x / W), ys = points.map(v => v.y / H), torso = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    if (!validBounds(torso))
        return null;
    let seated: boolean | null = null;
    if ([25, 26, 27, 28].every(i => pointGood(p[i]) && Number.isFinite(p[i].z)) && [23, 24].every(i => Number.isFinite(p[i].z))) {
        const angle = (h: number, k: number, a: number) => {
            const u = [(p[h].x - p[k].x) * W, (p[h].y - p[k].y) * H, (p[h].z! - p[k].z!) * W], v = [(p[a].x - p[k].x) * W, (p[a].y - p[k].y) * H, (p[a].z! - p[k].z!) * W];
            const den = Math.hypot(...u) * Math.hypot(...v);
            return den > 1 ? Math.acos(Math.max(-1, Math.min(1, u.reduce((s, x, i) => s + x * v[i], 0) / den))) * 180 / Math.PI : NaN;
        };
        const knees = [angle(23, 25, 27), angle(24, 26, 28)];
        if (knees.every(Number.isFinite))
            seated = knees.every(a => a >= 50 && a <= 140);
    }
    return { head: (p[0].y * H - shoulder.y) / width, angle: Math.atan2(shoulder.x - hip.x, hip.y - shoulder.y) * 180 / Math.PI, width, torso, points, seated };
}
/** Pure feature/reference state. No camera, event service, database or provider. */
export function createPoseProcessor(options:{getContinuityKey?:()=>string|null}={}) {
    const states = new Map<string, State>();
    const breakReference = (s: State) => { s.previous = null; if (!s.baseline) {
        s.referenceStart = null;
        s.reference = [];
    } };
    function reset(control: ReferenceControl) { const old = states.get(control.trackId); if (old && sameControl(old.control, control))
        return; if (old && old.control.identityEpoch === control.identityEpoch && old.control.generation > control.generation)
        return; states.set(control.trackId, newState(control)); }
    function process(f: BoundFrame, control: ReferenceControl, context: SensorContext, landmarks: PoseLandmark[][], unavailableReason?: string): PoseFrameResult {
        const syncId = context.getSyncId();
        if (!syncId || f.frame.runId !== context.runId) {
            const old = states.get(control.trackId);
            if (old)
                states.set(control.trackId, newState(old.control));
            return { observation: null, torso: null, poseMotion: null };
        }
        let state = states.get(control.trackId);
        if (!state) {
            reset(control);
            state = states.get(control.trackId)!;
        }
        const seq = context.nextSeq(), binding = f.binding;
        const base: Omit<PoseObservation, 'alignedAtMs' | 'receivedAtMs'> = { schemaVersion: 1, id: crypto.randomUUID(), sourceId: context.sourceId, runId: context.runId, seq, syncId, streamId: 'pose', referenceGeneration: control.generation, sourceAtMs: f.frame.sourceAtMs, trackId: binding?.trackId ?? control.trackId, visitId: binding?.visitId ?? null, identityEpoch: binding?.identityEpoch ?? control.identityEpoch, quality: 'low-quality', provenance: 'live_camera', activity: 'unknown', seated: null, qualifyingSlump: false, referenceReady: false, reason: null, features: {} };
        const fail = (reason: string, unavailable = false): PoseFrameResult => { breakReference(state!); return { observation: { ...base, quality: unavailable ? 'unavailable' : 'low-quality', reason, referenceReady: !!state!.baseline }, torso: null, poseMotion: null }; };
        if (!sameControl(state.control, control)) {
            if (state.control.identityEpoch === control.identityEpoch && state.control.generation > control.generation)
                return fail('Superseded reference generation');
            reset(control);
            state = states.get(control.trackId)!;
        }
        if (!metadataEligibility(f).identity || !binding || binding.trackId !== control.trackId || binding.visitId !== control.visitId || binding.identityEpoch !== control.identityEpoch)
            return fail('Reference control does not match a usable identity');
        if (!Number.isFinite(f.frame.sourceAtMs) || !Number.isFinite(f.frame.monotonicMs))
            return fail('Invalid pose timestamp');
        const key = JSON.stringify([context.sourceId, context.runId, options.getContinuityKey?.() ?? syncId, binding.trackId, binding.visitId, binding.identityEpoch]);
        if (state.key !== null && state.key !== key) {
            state = newState(control);
            states.set(control.trackId, state);
        }
        const dt = state.lastAt === null ? null : f.frame.sourceAtMs - state.lastAt, mono = state.lastMono === null ? null : f.frame.monotonicMs - state.lastMono;
        if (dt !== null && (dt <= 0 || f.frame.seq <= state.lastSeq || mono === null || mono <= 0))
            return fail('Out-of-order pose inference');
        if (dt !== null && (dt > 1000 || Math.abs(dt - mono!) > 50))
            breakReference(state);
        state.key = key;
        state.lastAt = f.frame.sourceAtMs;
        state.lastMono = f.frame.monotonicMs;
        state.lastSeq = f.frame.seq;
        if (unavailableReason)
            return fail(unavailableReason, true);
        if (landmarks.length !== 1)
            return fail('Expected one unambiguous pose candidate');
        const p = landmarks[0], g = geometry(p, f);
        if (!g)
            return fail('Missing visible nose, shoulders or hips');
        if (!validBounds(binding.bounds) || p[0].x < binding.bounds.x || p[0].x > binding.bounds.x + binding.bounds.width || p[0].y < binding.bounds.y || p[0].y > binding.bounds.y + binding.bounds.height)
            return fail('Pose nose is outside selected identity bounds');
        const previous = state.previous, motion = previous && dt ? median(g.points.map((point, i) => Math.hypot(point.x - previous.points[i].x, point.y - previous.points[i].y))) / Math.max(1, previous.width) / (dt / 1000) : null;
        const activity = motion === null ? 'unknown' : motion > POSE_THRESHOLDS.motionWidthsPerSecond ? 'moving' : 'stationary';
        const upright = g.head < 0 && Math.abs(g.angle) <= POSE_THRESHOLDS.referenceTorsoAngleDeg;
        if (activity === 'moving' || g.seated !== true || (!state.baseline && !upright)) {
            breakReference(state);
        }
        else if (state.referenceStart === null) {
            state.referenceStart = f.frame.sourceAtMs;
        }
        // First geometry is provisional until a second frame confirms stationary continuity.
        if (previous === null && g.seated === true && upright && activity === 'unknown' && !state.baseline) {
            state.referenceStart = f.frame.sourceAtMs;
            state.reference = [];
        }
        if (!state.baseline && state.referenceStart !== null && g.seated === true && upright && activity !== 'moving') {
            state.reference.push({ head: g.head, angle: g.angle });
            if (f.frame.sourceAtMs - state.referenceStart >= POSE_THRESHOLDS.referenceMs && activity === 'stationary')
                state.baseline = { head: median(state.reference.map(v => v.head)), angle: median(state.reference.map(v => v.angle)) };
        }
        state.previous = g;
        const headDescent = state.baseline ? g.head - state.baseline.head : 0, torsoAngleChange = state.baseline ? Math.abs(g.angle - state.baseline.angle) : 0;
        const quality = g.seated === null ? 'low-quality' : 'usable';
        return { observation: { ...base, quality, activity, seated: g.seated, referenceReady: !!state.baseline, qualifyingSlump: quality === 'usable' && activity === 'stationary' && g.seated === true && !!state.baseline && (headDescent >= POSE_THRESHOLDS.headDescentWidths - 1e-9 || torsoAngleChange >= POSE_THRESHOLDS.torsoAngleChangeDeg - 1e-9), reason: g.seated === null ? 'Insufficient visible leg geometry for seated assessment' : !state.baseline && !upright ? 'An upright seated pose is required to collect a reference' : activity === 'unknown' ? 'Collecting movement comparison' : null, features: { headShoulderDisplacement: g.head, shoulderWidthPx: g.width, torsoAngleDeg: g.angle, headDescent, torsoAngleChange, uprightReferenceEligible: upright ? 1 : 0, referenceCollectedMs: state.referenceStart === null ? 0 : f.frame.sourceAtMs - state.referenceStart, ...(motion === null ? {} : { poseMotion: motion }) } }, torso: quality === 'usable' && activity === 'stationary' ? g.torso : null, poseMotion: quality === 'usable' ? motion : null };
    }
    return { process, reset };
}
let processor = createPoseProcessor(), model: PoseLandmarker | null = null, initializing: Promise<void> | null = null, modelGeneration = 0;
/** Local assets only. Call before scheduling frames; no camera access. */
export function initializePoseModel(): Promise<void> {
    if (model)
        return Promise.resolve();
    if (initializing)
        return initializing;
    const generation = modelGeneration;
    initializing = (async () => {
        const { FilesetResolver, PoseLandmarker: Landmarker } = await import('@mediapipe/tasks-vision');
        const files = await FilesetResolver.forVisionTasks('/models/mediapipe-1.1.1/wasm');
        const loaded = await Landmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/models/pose/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 2, minPoseDetectionConfidence: 0.7, minPosePresenceConfidence: 0.7, minTrackingConfidence: 0.7, outputSegmentationMasks: false });
        if (generation !== modelGeneration) {
            loaded.close();
            throw new Error('Pose initialization superseded');
        }
        model = loaded;
    })().finally(() => { initializing = null; });
    return initializing;
}
export function disposePoseModel() { modelGeneration++; model?.close(); model = null; processor = createPoseProcessor(); }
export function resetPoseReference(control: ReferenceControl) { processor.reset(control); }
/** Synchronous inference happens before this Promise returns. Borrowed bitmap is never retained. */
export async function extractPose(frame: BoundFrame, control: ReferenceControl, context: SensorContext): Promise<PoseFrameResult> {
    if (!model)
        return processor.process(frame, control, context, [], 'Pose model not initialized');
    if (!metadataEligibility(frame).identity)
        return processor.process(frame, control, context, []);
    try {
        const result = model.detectForVideo(frame.frame.image, frame.frame.monotonicMs);
        return processor.process(frame, control, context, result.landmarks);
    }
    catch {
        return processor.process(frame, control, context, [], 'Pose inference unavailable');
    }
}
