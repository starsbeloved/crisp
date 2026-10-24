import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { AlertSnapshot, Answers, Binding, CheckRequest, ID, Measurement, QuestionnaireSummary, ReferenceControl, RoomSnapshot, Visit } from '../shared/contracts.ts';
import { answersSchema, checkRequestSchema, idSchema, measurementSchema, summarySchema } from '../shared/schemas.ts';

export class StoreError extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'StoreError'; this.status = status; this.code = code; }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new StoreError(400, 'INVALID_BODY', 'Request does not match schemaVersion 1');
  return result.data;
}
const createSchema = z.strictObject({ requestId: idSchema, label: z.string().min(1).max(500).optional(), preferredName: z.string().trim().min(1).max(80).optional(), consent: z.boolean().optional() });
export const questionnaireWriteSchema = z.strictObject({ requestId: idSchema, answers: answersSchema, summary: summarySchema.optional() });
export const seatWriteSchema = z.strictObject({ requestId: idSchema, label: z.string().min(1).max(500).nullable() });
export interface WaitingRoomStore {
  createVisit(input: { requestId: ID; label?: string; preferredName?:string; consent?:boolean }): Visit;
  finishVisit(visitId:ID, requestId:ID):Visit;
  getVisit(visitId: ID): Visit;
  saveQuestionnaire(visitId: ID, input: { requestId: ID; answers: Answers; summary?: QuestionnaireSummary }): Visit;
  assignSeat(visitId: ID, input: { requestId: ID; label: string | null }): Visit;
  saveContactMeasurement(input: { requestId: ID; measurement: Measurement }): Measurement;
  saveCheckRequest(snapshot:AlertSnapshot, contextKey:string):CheckRequest;
  refreshRequestContext(eventId:ID,binding:Binding|null,contextKey:string):CheckRequest;
  buildAlertSnapshot(eventId:ID):AlertSnapshot;
  actOnRequest(eventId:ID,state:'acknowledged'|'checked',requestId:ID,referenceControl:ReferenceControl|null):{request:CheckRequest;referenceControl:ReferenceControl|null};
  getRoomSnapshot(): RoomSnapshot;
  close(): void;
}
export function createStore(opts: { databasePath: string; now?: () => number }): WaitingRoomStore {
  if (opts.databasePath !== ':memory:') mkdirSync(dirname(opts.databasePath), { recursive: true });
  const db = new DatabaseSync(opts.databasePath); const now = opts.now ?? Date.now;
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS contact_measurements (id TEXT PRIMARY KEY, capture_id TEXT NOT NULL UNIQUE, visit_id TEXT NOT NULL REFERENCES visits(id), body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS check_requests (id TEXT PRIMARY KEY, visit_id TEXT REFERENCES visits(id), body TEXT NOT NULL, context_key TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_actions (request_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES check_requests(id), state TEXT NOT NULL, at_ms REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS idempotency (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS room_revision (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO room_revision VALUES (1, 0);`);
  let closed = false;
  function mutate<T>(requestId: string, operation: string, input: unknown, action: () => T): T {
    const fingerprint = canonical({ operation, input });
    db.exec('BEGIN IMMEDIATE');
    try {
      const prior = db.prepare('SELECT fingerprint, result FROM idempotency WHERE request_id = ?').get(requestId);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new StoreError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID was already used with different content');
        db.exec('COMMIT'); return JSON.parse(prior.result as string) as T;
      }
      const value = action();
      db.prepare('INSERT INTO idempotency VALUES (?, ?, ?)').run(requestId, fingerprint, JSON.stringify(value));
      db.exec('UPDATE room_revision SET revision = revision + 1 WHERE singleton = 1');
      db.exec('COMMIT'); return value;
    } catch (cause) { db.exec('ROLLBACK'); throw cause; }
  }
  function getVisit(visitId: ID): Visit {
    parse(idSchema, visitId);
    const row = db.prepare('SELECT body FROM visits WHERE id = ?').get(visitId);
    if (!row) throw new StoreError(404, 'NOT_FOUND', 'Visit not found');
    return { preferredName: null, consentAtMs: null, completedAtMs: null, ...JSON.parse(row.body as string) } as Visit;
  }
  function writeVisit(visit: Visit): Visit { db.prepare('UPDATE visits SET body = ? WHERE id = ?').run(JSON.stringify(visit), visit.id); return visit; }
  function requireIncomplete(visitId:ID) {
    const visit=getVisit(visitId);
    if(visit.completedAtMs!==null)throw new StoreError(409,'VISIT_COMPLETED','This check-in has ended');
    return visit;
  }
  function buildAlertSnapshot(eventId:ID):AlertSnapshot {
    parse(idSchema,eventId);const row=db.prepare('SELECT body FROM check_requests WHERE id = ?').get(eventId);
    if(!row)throw new StoreError(404,'NOT_FOUND','Check request not found');
    return JSON.parse(row.body as string) as AlertSnapshot;
  }
  function writeSnapshot(snapshot:AlertSnapshot,contextKey?:string) {
    if(contextKey!==undefined)db.prepare('UPDATE check_requests SET body = ?, context_key = ? WHERE id = ?').run(JSON.stringify(snapshot),contextKey,snapshot.eventId);
    else db.prepare('UPDATE check_requests SET body = ? WHERE id = ?').run(JSON.stringify(snapshot),snapshot.eventId);
  }
  function refreshRequestContext(eventId:ID,binding:Binding|null,contextKey:string):CheckRequest {
    const snapshot=buildAlertSnapshot(eventId),row=db.prepare('SELECT context_key FROM check_requests WHERE id = ?').get(eventId)!;
    if(row.context_key===contextKey || snapshot.event.state==='checked')return snapshot.event;
    snapshot.event={...snapshot.event,snapshotVersion:snapshot.event.snapshotVersion+1,updatedAtMs:now(),location:binding?.observedLocation?.label??null};
    snapshot.version=snapshot.event.snapshotVersion;snapshot.binding=binding;
    writeSnapshot(snapshot,contextKey);db.exec('UPDATE room_revision SET revision=revision+1 WHERE singleton=1');
    return snapshot.event;
  }
  // Persisted evidence survives a restart, but camera identity and pending provider authority do not.
  for(const row of db.prepare('SELECT id FROM check_requests').all()){
    const snapshot=buildAlertSnapshot(row.id as string);
    if(snapshot.binding && snapshot.event.state!=='checked')refreshRequestContext(snapshot.eventId,null,'unverified');
  }
  return {
    createVisit(raw) {
      const input = parse(createSchema, raw);
      return mutate(input.requestId, 'createVisit', input, () => {
        const id = randomUUID();
        const visit: Visit = { id, label: input.label ?? `Patient ${id.slice(0, 8)}`, createdAtMs: now(), answers: null, summary: null, assignedSeat: null, preferredName:input.preferredName ?? null, consentAtMs:input.consent ? now() : null, completedAtMs:null };
        db.prepare('INSERT INTO visits VALUES (?, ?)').run(id, JSON.stringify(visit)); return visit;
      });
    },
    getVisit,
    finishVisit(visitId, requestId) {
      parse(idSchema, visitId); parse(idSchema, requestId);
      return mutate(requestId, 'finishVisit', { visitId }, () => {
        const visit = getVisit(visitId);
        if (!visit.answers) throw new StoreError(409, 'ANSWERS_REQUIRED', 'Save your answers before finishing check-in');
        return visit.completedAtMs === null ? writeVisit({ ...visit, completedAtMs:now() }) : visit;
      });
    },
    saveQuestionnaire(visitId, raw) {
      const input = parse(questionnaireWriteSchema, raw); parse(idSchema, visitId);
      return mutate(input.requestId, 'questionnaire', { visitId, ...input }, () => writeVisit({ ...requireIncomplete(visitId), answers: input.answers, summary: input.summary ?? null }));
    },
    assignSeat(visitId, raw) {
      const input = parse(seatWriteSchema, raw); parse(idSchema, visitId);
      return mutate(input.requestId, 'seat', { visitId, ...input }, () => writeVisit({ ...getVisit(visitId), assignedSeat: input.label === null ? null : { label: input.label, assignedAtMs: now() } }));
    },
    saveContactMeasurement(raw) {
      const input = parse(z.strictObject({ requestId: idSchema, measurement: measurementSchema }), raw);
      const m = input.measurement;
      if (m.streamId !== 'phone' || m.provenance !== 'live_phone') throw new StoreError(400, 'INVALID_MEASUREMENT', 'Only live phone contact measurements can be saved here');
      return mutate(input.requestId, 'contactMeasurement', input, () => {
        requireIncomplete(m.visitId!);
        if (db.prepare('SELECT id FROM contact_measurements WHERE id = ? OR capture_id = ?').get(m.id, m.captureId)) throw new StoreError(409, 'CAPTURE_COMPLETED', 'Capture or measurement already saved');
        db.prepare('INSERT INTO contact_measurements VALUES (?, ?, ?, ?)').run(m.id, m.captureId!, m.visitId!, JSON.stringify(m));
        return m;
      });
    },
    saveCheckRequest(snapshot,contextKey) {
      const request=parse(checkRequestSchema,snapshot.event);
      if(request.visitId)getVisit(request.visitId);
      const existing=db.prepare('SELECT body FROM check_requests WHERE id = ?').get(request.id);
      if(existing){
        if(canonical(JSON.parse(existing.body as string))!==canonical(snapshot))throw new StoreError(409,'REQUEST_CONFLICT','Check request already exists');
        return buildAlertSnapshot(request.id).event;
      }
      db.prepare('INSERT INTO check_requests VALUES (?, ?, ?, ?)').run(request.id,request.visitId,JSON.stringify(snapshot),contextKey);
      db.exec('UPDATE room_revision SET revision=revision+1 WHERE singleton=1');return structuredClone(request);
    },
    refreshRequestContext,buildAlertSnapshot,
    actOnRequest(eventId,state,requestId,referenceControl) {
      parse(idSchema,eventId);parse(idSchema,requestId);
      return mutate(requestId,'staffAction',{eventId,state},()=>{
        const snapshot=buildAlertSnapshot(eventId),prior=snapshot.event.state;
        const changed=prior!=='checked' && prior!==state;
        if(changed){
          snapshot.event={...snapshot.event,state,updatedAtMs:now(),snapshotVersion:snapshot.event.snapshotVersion+1};
          snapshot.version=snapshot.event.snapshotVersion;writeSnapshot(snapshot);
        }
        db.prepare('INSERT INTO staff_actions VALUES (?, ?, ?, ?)').run(requestId,eventId,state,now());
        return {request:snapshot.event,referenceControl:state==='checked'?referenceControl:null};
      });
    },
    getRoomSnapshot() {
      return { schemaVersion: 2, revision: Number(db.prepare('SELECT revision FROM room_revision WHERE singleton=1').get()!.revision), serverNowMs: now(),
        visits: db.prepare('SELECT id FROM visits ORDER BY rowid').all().map(row => getVisit(row.id as string)),
        measurements: db.prepare('SELECT body FROM contact_measurements ORDER BY rowid').all().map(row => JSON.parse(row.body as string) as Measurement),
        bindings: [], poses: [], referenceControls: [], requests: db.prepare('SELECT body FROM check_requests ORDER BY rowid').all().map(row=>(JSON.parse(row.body as string) as AlertSnapshot).event), explanations: {}, audioJobs: [], cameraState: 'off' };
    },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}
