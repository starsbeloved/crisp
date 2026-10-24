import { z } from 'zod';

export const idSchema = z.string().min(1).max(96).regex(/^[A-Za-z0-9_-]+$/);
const time = z.number().finite().nonnegative();
const count = z.number().int().nonnegative();
const text = z.string().max(500);
const quality = z.enum(['collecting','usable','low-quality','unavailable','stale']);
const provenance = z.enum(['live_phone','live_camera','manual','synthetic','replay']);
const metrics = z.record(z.string(), z.number().finite());
const bounds = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).refine(b => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001, 'Bounds outside frame');
export const answersSchema = z.strictObject({ reason: text, onset: z.enum(['today','yesterday','several-days','longer','not-sure']), onsetNote: z.string().max(200), course: z.enum(['better','same','worse','intermittent','not-applicable']) });
export const summarySchema = z.strictObject({ complaint: text, onset: text, course: text, confirmed: z.boolean() });
export const visitSchema = z.strictObject({ id: idSchema, label: text.min(1), preferredName: z.string().min(1).max(80).nullable(), consentAtMs:time.nullable(), completedAtMs:time.nullable(), createdAtMs: time, answers: answersSchema.nullable(), summary: summarySchema.nullable(), assignedSeat: z.strictObject({ label: text.min(1), assignedAtMs: time }).nullable() });
export const bindingSchema = z.strictObject({ trackId: idSchema, visitId: idSchema.nullable(), identityEpoch: idSchema, state: z.enum(['matched','unknown','uncertain']), sourceId: idSchema, runId: idSchema, sinceMs: time, lastVerifiedAtMs: time, bounds, observedLocation: z.strictObject({ label: text, observedAtMs: time }).nullable() }).refine(b => b.sinceMs <= b.lastVerifiedAtMs && (b.state === 'matched' ? b.visitId !== null : b.visitId === null), 'Invalid binding interval/association');
export const bindingInputSchema = z.strictObject({ trackId: idSchema, visitId: idSchema.nullable(), identityEpoch: idSchema, state: z.enum(['matched','unknown','uncertain']), bounds, sourceSinceAtMs: time, sourceLastVerifiedAtMs: time, observedLocation: z.strictObject({ label: text, sourceObservedAtMs: time }).nullable() }).refine(b => b.sourceSinceAtMs <= b.sourceLastVerifiedAtMs && (b.state === 'matched' ? b.visitId !== null : b.visitId === null), 'Invalid binding input');
export const bindingBatchSchema = z.strictObject({ schemaVersion: z.literal(1), id: idSchema, sourceId: idSchema, runId: idSchema, streamId: z.literal('binding'), seq: count, syncId: idSchema, sourceAtMs: time, bindings: z.array(bindingInputSchema).max(100) }).refine(b => b.bindings.every(v => v.sourceLastVerifiedAtMs <= b.sourceAtMs && (!v.observedLocation || v.observedLocation.sourceObservedAtMs <= b.sourceAtMs)), 'Nested binding time is in the future');
export const referenceControlSchema = z.strictObject({ trackId: idSchema, visitId: idSchema, identityEpoch: idSchema, generation: z.number().int().positive() });
const measurementShape = {
  schemaVersion: z.literal(1), id: idSchema, sourceId: idSchema, runId: idSchema, seq: count, syncId: idSchema,
  streamId: z.enum(['phone','rppg','breathing']), channel: z.enum(['pulse','breathing']), method: z.enum(['phone-camera-contact-ppg','camera-pos','camera-torso-motion']),
  trackId: idSchema.nullable(), visitId: idSchema.nullable(), identityEpoch: idSchema.nullable(), captureId: idSchema.nullable(),
  sourceStartAtMs: time, sourceEndAtMs: time, quality, value: z.number().finite().nullable(), unit: z.enum(['bpm','breaths/min']), provenance, reason: text.nullable(), metrics,
};
function validMeasurement(m: z.infer<z.ZodObject<typeof measurementShape>>) {
  if (m.sourceStartAtMs > m.sourceEndAtMs || (m.quality === 'usable' ? m.value === null : m.value !== null)) return false;
  if (m.streamId === 'phone') return m.channel === 'pulse' && m.unit === 'bpm' && m.method === 'phone-camera-contact-ppg' && m.visitId !== null && m.captureId !== null && m.trackId === null && m.identityEpoch === null && ['live_phone','synthetic','replay'].includes(m.provenance);
  return m.trackId !== null && m.identityEpoch !== null && m.captureId === null && ['live_camera','synthetic','replay'].includes(m.provenance) && (m.streamId === 'rppg' ? m.channel === 'pulse' && m.unit === 'bpm' && m.method === 'camera-pos' : m.channel === 'breathing' && m.unit === 'breaths/min' && m.method === 'camera-torso-motion');
}
export const measurementInputSchema = z.strictObject(measurementShape).refine(validMeasurement, 'Measurement source, interval, quality or unit mismatch');
export const measurementSchema = z.strictObject({ ...measurementShape, alignedStartAtMs: time, alignedEndAtMs: time, receivedAtMs: time }).refine(validMeasurement, 'Measurement source, interval, quality or unit mismatch').refine(m => m.alignedStartAtMs <= m.alignedEndAtMs, 'Negative aligned interval');
const poseShape = { schemaVersion: z.literal(1), id: idSchema, sourceId: idSchema, runId: idSchema, seq: count, syncId: idSchema, streamId: z.literal('pose'), referenceGeneration: count, sourceAtMs: time, trackId: idSchema, visitId: idSchema.nullable(), identityEpoch: idSchema, quality, provenance: z.enum(['live_camera','synthetic','replay']), activity: z.enum(['stationary','moving','unknown']), seated: z.boolean().nullable(), qualifyingSlump: z.boolean(), referenceReady: z.boolean(), reason: text.nullable(), features: metrics };
export const poseInputSchema = z.strictObject(poseShape);
export const poseSchema = z.strictObject({ ...poseShape, alignedAtMs: time, receivedAtMs: time });
const factSchema = z.strictObject({ id: idSchema, kind: z.enum(['detector','measurement','reported','missing','scenario']), text, sourceIds: z.array(idSchema), provenance: provenance.nullable(), atMs: time });
export const checkRequestSchema = z.strictObject({ id: idSchema, visitId: idSchema.nullable(), trackId: idSchema, identityEpoch: idSchema, state: z.enum(['open','acknowledged','checked']), createdAtMs: time, updatedAtMs: time, snapshotVersion: z.number().int().positive(), reason: z.literal('sustained-seated-posture-change'), durationMs: time, location: text.nullable(), facts: z.array(factSchema) });
const explanationSchema = z.strictObject({ eventId: idSchema, snapshotVersion: z.number().int().positive(), statements: z.array(z.strictObject({ evidenceId: idSchema, phraseKey: z.enum(['observed','reported','missing','simulated']) })), explanation: z.string(), notificationText: z.string(), evidenceIds: z.array(idSchema), limitations: z.array(z.string()) });
export const roomSnapshotSchema = z.strictObject({ schemaVersion: z.literal(2), revision: count, serverNowMs: time, visits: z.array(visitSchema), bindings: z.array(bindingSchema), measurements: z.array(measurementSchema), poses: z.array(poseSchema), referenceControls: z.array(referenceControlSchema), requests: z.array(checkRequestSchema), explanations: z.record(idSchema, z.strictObject({ state: z.enum(['idle','pending','ready','fallback','unavailable']), value: explanationSchema.nullable() })), audioJobs: z.array(z.strictObject({ id: idSchema, eventId: idSchema, snapshotVersion: z.number().int().positive(), state: z.enum(['pending','ready','failed','cancelled']), text: z.string(), url: z.string().nullable(), createdAtMs: time })), cameraState: z.enum(['off','live','stale','unavailable']) });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const ingestSchema = z.strictObject({ measurements: z.array(measurementInputSchema), poses: z.array(poseInputSchema) }).superRefine((batch, ctx) => {
  const rows = [...batch.measurements, ...batch.poses];
  if (rows.length > 100) ctx.addIssue({ code: 'custom', message: 'At most 100 observations' });
  const seen = new Map<string,string>();
  for (const row of rows) for (const key of [`id:${row.id}`, `seq:${row.sourceId}:${row.runId}:${row.streamId}:${row.seq}`]) {
    const body = canonical(row);
    if (seen.has(key) && seen.get(key) !== body) ctx.addIssue({ code: 'custom', message: 'Conflicting observation reuse' });
    seen.set(key, body);
  }
});
export const clockStartSchema = z.strictObject({ phase:z.literal('start'), sourceId:idSchema, runId:idSchema, clientSendMs:time });
export const clockCompleteSchema = z.strictObject({ phase:z.literal('complete'), handshakeId:idSchema, clientReceiveMs:time });
export const clockHandshakeSchema = z.strictObject({ handshakeId:idSchema, serverReceiveMs:time, serverSendMs:time }).refine(h => h.serverReceiveMs <= h.serverSendMs, 'Reversed service interval');
export const clockSyncSchema = z.strictObject({ id:idSchema, sourceId:idSchema, runId:idSchema, offsetMs:z.number().finite(), uncertaintyMs:z.number().finite().min(0).max(500), expiresAtMs:time });
