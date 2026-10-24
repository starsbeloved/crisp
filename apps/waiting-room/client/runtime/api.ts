import { z } from 'zod';
import type { Answers, BindingBatch, ClockStart, ClockComplete, ID, Measurement, QuestionnaireSummary } from '../../shared/contracts.ts';
import { clockStartSchema, clockCompleteSchema, clockHandshakeSchema, clockSyncSchema } from '../../shared/schemas.ts';
import { answersSchema,bindingBatchSchema, checkRequestSchema, idSchema, ingestSchema,measurementInputSchema, measurementSchema, referenceControlSchema, roomSnapshotSchema, summarySchema,visitSchema } from '../../shared/schemas.ts';
export class ApiError extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
async function request<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/wr${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  catch { throw new ApiError(0, 'NETWORK_ERROR', 'Local service is unavailable'); }
  let value: unknown;
  try { value = await response.json(); } catch { throw new ApiError(response.ok ? 502 : response.status, 'INVALID_RESPONSE', 'Service returned invalid JSON'); }
  if (!response.ok) { const parsed = errorSchema.safeParse(value); throw new ApiError(response.status, parsed.success ? parsed.data.error.code : 'HTTP_ERROR', parsed.success ? parsed.data.error.message : 'Request failed'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(502, 'INVALID_RESPONSE', 'Service response does not match schemaVersion 1');
  return parsed.data;
}
function parseInput<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new ApiError(400, 'INVALID_REQUEST', 'Request does not match schemaVersion 1'); return parsed.data; }
const part = (id: ID) => encodeURIComponent(parseInput(idSchema, id));
const counts = z.strictObject({ accepted: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), rejected: z.number().int().nonnegative() });
export const api = {
  startKiosk: async () => request('POST','/kiosk',z.strictObject({ok:z.literal(true)}),{}),
  kioskSession: async () => request('POST','/kiosk/session',z.strictObject({visit:visitSchema.nullable(),receipt:z.strictObject({visitId:idSchema,label:z.string(),completedAtMs:z.number().finite().nonnegative()}).optional()}),{}),
  kioskCreateVisit: async (input:{requestId:ID;preferredName?:string;consent?:boolean}) => request('POST','/kiosk/visit',visitSchema,input),
  kioskSaveQuestionnaire: async (input:{requestId:ID;answers:Answers;summary?:QuestionnaireSummary}) => request('POST','/kiosk/questionnaire',visitSchema,input),
  kioskPair: async (requestId:ID) => request('POST','/kiosk/pair',z.strictObject({code:z.string().regex(/^\d{8}$/),expiresAtMs:z.number().finite().nonnegative()}),{requestId}),
  kioskTakeover: async (requestId:ID) => request('POST','/kiosk/takeover',z.strictObject({ok:z.literal(true)}),{requestId}),
  kioskFinish: async (requestId:ID) => request('POST','/kiosk/finish',z.strictObject({visitId:idSchema,label:z.string(),completedAtMs:z.number().finite().nonnegative()}),{requestId}),
  kioskReset: async (requestId:ID) => request('POST','/kiosk/reset',z.strictObject({ok:z.literal(true)}),{requestId}),
  startClockSync: async (input: ClockStart) => request('POST', '/clock-sync', clockHandshakeSchema, parseInput(clockStartSchema, input)),
  completeClockSync: async (input: ClockComplete) => request('POST', '/clock-sync', clockSyncSchema, parseInput(clockCompleteSchema, input)),
  health: async () => request('GET', '/health', z.strictObject({ ok: z.literal(true), serverNowMs: z.number().finite().nonnegative() })),
  startStation: async () => request('POST', '/station', z.strictObject({ ok: z.literal(true) }), {}),
  createVisit: async (input: { requestId: ID; label?: string; preferredName?:string; consent?:boolean }) => request('POST', '/visits', visitSchema, input),
  getRoom: async () => request('GET', '/room', roomSnapshotSchema),
  saveQuestionnaire: async (visitId: ID, input: { requestId: ID; answers: Answers; summary?: QuestionnaireSummary }) => request('PUT', `/visits/${part(visitId)}/questionnaire`, visitSchema, input),
  assignSeat: async (visitId: ID, input: { requestId: ID; label: string|null }) => request('PUT', `/visits/${part(visitId)}/seat`, visitSchema, input),
  createPair: async (visitId: ID, input: { requestId: ID; purpose: 'ppg'|'questionnaire'|'patient' }) => request('POST', `/visits/${part(visitId)}/pair`, z.strictObject({ code: z.string().regex(/^\d{8}$/), expiresAtMs: z.number().finite().nonnegative() }), input),
  join: async (code: string) => request('POST', '/join', z.strictObject({ visitId: idSchema, purpose: z.enum(['ppg','questionnaire','patient']) }), { code }),
  patientSession: async () => request('POST', '/patient/session', z.strictObject({visit:visitSchema,expiresAtMs:z.number().finite().nonnegative(),canEditQuestionnaire:z.boolean(),contactMeasurement:measurementSchema.nullable().optional()}), {}),
  finishPatient: async (requestId:ID) => request('POST', '/patient/finish', z.strictObject({visitId:idSchema,label:z.string(),completedAtMs:z.number().finite().nonnegative()}), {requestId}),
  takeoverQuestionnaire: async (visitId:ID,requestId:ID) => request('POST', `/visits/${part(visitId)}/takeover`, z.strictObject({ok:z.literal(true)}), {requestId}),
  createCapture: async (input: { requestId: ID; sourceId: ID; runId: ID }) => request('POST', '/captures', z.strictObject({ captureId: idSchema, visitId: idSchema }), input),
  completeCapture: async (captureId: ID, input: { requestId: ID; measurement: Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'> }) => request('POST', `/captures/${part(captureId)}/complete`, measurementSchema, { ...input, measurement: parseInput(measurementInputSchema, input.measurement) }),
  cancelCapture: async (captureId: ID, requestId: ID) => request('POST', `/captures/${part(captureId)}/cancel`, z.strictObject({ cancelled: z.literal(true) }), { requestId }),
  acknowledge: async (eventId: ID, requestId: ID) => request('POST', `/requests/${part(eventId)}/acknowledge`, checkRequestSchema, { requestId }),
  markChecked: async (eventId: ID, requestId: ID) => request('POST', `/requests/${part(eventId)}/check`, z.strictObject({ request: checkRequestSchema, referenceControl: referenceControlSchema.nullable() }), { requestId }),
  updateBindings: async (batch: BindingBatch) => request('POST', '/bindings', counts, parseInput(bindingBatchSchema, batch)),
  ingestObservations:async (input:z.infer<typeof ingestSchema>)=>request('POST','/observations',counts,parseInput(ingestSchema,input)),
  summarizeQuestionnaire:async(visitId:ID,answers:Answers)=>request('POST','/questionnaire-summary',summarySchema,{visitId:parseInput(idSchema,visitId),answers:parseInput(answersSchema,answers)}),
};
