import { afterEach, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { createStore } from '../server/store.ts';
import type { WaitingRoomStore } from '../server/store.ts';
import type { AlertSnapshot, Answers, Measurement } from '../shared/contracts.ts';
import { roomSnapshotSchema } from '../shared/schemas.ts';

const stores: WaitingRoomStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
const open = (databasePath = ':memory:') => { const store = createStore({ databasePath, now: () => 100000 }); stores.push(store); return store; };
const answers: Answers = { reason: 'Original words', onset: 'today', onsetNote: 'this morning', course: 'same' };
const summary = { complaint: 'Reported concern', onset: 'today', course: 'unchanged', confirmed: false };

it('creates separate visits and returns detached snapshots with no restored camera identity', () => {
  const store = open();
  const first = store.createVisit({ requestId: 'first' });
  const second = store.createVisit({ requestId: 'second', label: 'Patient demo' });
  expect(second.id).not.toBe(first.id);
  expect(first.answers).toBeNull();
  first.label = 'mutated';
  const room = store.getRoomSnapshot();
  expect(room.visits[0].label).not.toBe('mutated');
  expect(room).toMatchObject({ cameraState: 'off', bindings: [], measurements: [], poses: [], requests: [] });
  expect(roomSnapshotSchema.safeParse(room).success).toBe(true);
});

it('preserves original answers alongside a proposed and explicitly confirmed corrected summary', () => {
  const store = open(); const a = store.createVisit({ requestId: 'a' }); const b = store.createVisit({ requestId: 'b' });
  const proposed = store.saveQuestionnaire(a.id, { requestId: 'form', answers, summary });
  expect(proposed).toMatchObject({ answers, summary });
  const confirmed = store.saveQuestionnaire(a.id, { requestId: 'confirm', answers, summary: { ...summary, complaint: 'Corrected by patient', confirmed: true } });
  expect(confirmed.answers).toEqual(answers);
  expect(confirmed.summary).toEqual({ ...summary, complaint: 'Corrected by patient', confirmed: true });
  expect(store.getVisit(b.id).answers).toBeNull();
  const withoutSummary = store.saveQuestionnaire(a.id, { requestId: 'new-answers', answers: { ...answers, reason: 'Changed answer' } });
  expect(withoutSummary.summary).toBeNull();
});

it('validates answers and stores seat assignments separately from any observed location', () => {
  const store = open(); const visit = store.createVisit({ requestId: 'a' });
  expect(() => store.saveQuestionnaire(visit.id, { requestId: 'bad', answers: { ...answers, reason: 'x'.repeat(501) } })).toThrow();
  expect(store.saveQuestionnaire(visit.id, { requestId: 'max', answers: { ...answers, reason: 'x'.repeat(500) } }).answers?.reason).toHaveLength(500);
  expect(store.assignSeat(visit.id, { requestId: 'seat', label: 'B4' }).assignedSeat).toEqual({ label: 'B4', assignedAtMs: 100000 });
  expect(store.getRoomSnapshot().bindings).toEqual([]);
  expect(store.assignSeat(visit.id, { requestId: 'clear', label: null }).assignedSeat).toBeNull();
  expect(() => store.getVisit('missing')).toThrowError(expect.objectContaining({ status: 404, code: 'NOT_FOUND' }));
});

it('returns original idempotent results and rejects request key reuse across payloads and operations', () => {
  const store = open(); const visit = store.createVisit({ requestId: 'a' });
  expect(store.createVisit({ requestId: 'a' })).toEqual(visit);
  expect(() => store.createVisit({ requestId: 'a', label: 'different' })).toThrowError(expect.objectContaining({ status: 409 }));
  const first = store.assignSeat(visit.id, { requestId: 'seat', label: 'B4' });
  store.assignSeat(visit.id, { requestId: 'later', label: 'C2' });
  expect(store.assignSeat(visit.id, { requestId: 'seat', label: 'B4' })).toEqual(first);
  expect(store.getVisit(visit.id).assignedSeat?.label).toBe('C2');
  expect(() => store.assignSeat(visit.id, { requestId: 'a', label: null })).toThrowError(expect.objectContaining({ status: 409 }));
});

it('reloads durable visits, forms, seats and immutable contact measurements from a fresh SQLite instance', () => {
  const dir = mkdtempSync(join(process.cwd(), '.local/test-runs/backend-P2A/store-'));
  const databasePath = join(dir, 'retained.sqlite');
  const store = open(databasePath); const visit = store.createVisit({ requestId: 'a' });
  store.saveQuestionnaire(visit.id, { requestId: 'form', answers, summary });
  store.assignSeat(visit.id, { requestId: 'seat', label: 'B4' });
  const measurement: Measurement = { schemaVersion: 1, id: 'm', sourceId: 'phone', runId: 'run', seq: 1, syncId: 'sync', streamId: 'phone', channel: 'pulse', method: 'phone-camera-contact-ppg', trackId: null, visitId: visit.id, identityEpoch: null, captureId: 'capture', sourceStartAtMs: 50000, sourceEndAtMs: 80000, alignedStartAtMs: 60000, alignedEndAtMs: 90000, receivedAtMs: 100000, quality: 'usable', value: 72, unit: 'bpm', provenance: 'live_phone', reason: null, metrics: { usableMs: 30000 } };
  expect(store.saveContactMeasurement({ requestId: 'complete', measurement })).toEqual(measurement);
  expect(store.saveContactMeasurement({ requestId: 'complete', measurement })).toEqual(measurement);
  expect(() => store.saveContactMeasurement({ requestId: 'changed', measurement: { ...measurement, value: 99 } })).toThrowError(expect.objectContaining({ status: 409 }));
  store.close(); stores.splice(stores.indexOf(store), 1);
  const fresh = open(databasePath);
  expect(fresh.getVisit(visit.id)).toMatchObject({ answers, summary, assignedSeat: { label: 'B4' } });
  expect(fresh.getRoomSnapshot().measurements).toEqual([measurement]);
  expect(fresh.createVisit({ requestId: 'a' })).toEqual(visit);
  expect(fresh.getRoomSnapshot()).toMatchObject({ cameraState: 'off', bindings: [] });
});

it('persists immutable request evidence and idempotent staff actions, restoring identity as unverified',()=>{
  const dir=mkdtempSync(join(process.cwd(),'.local/test-runs/backend-P2A/events-')),path=join(dir,'retained.sqlite');
  const store=open(path),visit=store.createVisit({requestId:'v'});
  const event:AlertSnapshot={eventId:'event',version:1,event:{id:'event',visitId:visit.id,trackId:'track',identityEpoch:'epoch',state:'open',createdAtMs:100000,updatedAtMs:100000,snapshotVersion:1,reason:'sustained-seated-posture-change',durationMs:10000,location:'Window side',facts:[{id:'fact',kind:'detector',text:'A seated posture change persisted for 10 seconds.',sourceIds:['pose'],provenance:'live_camera',atMs:100000}]},
    binding:{trackId:'track',visitId:visit.id,identityEpoch:'epoch',state:'matched',sourceId:'camera',runId:'run',sinceMs:80000,lastVerifiedAtMs:100000,bounds:{x:0,y:0,width:.5,height:.5},observedLocation:{label:'Window side',observedAtMs:100000}},visit,measurements:[],facts:[]};
  event.facts=event.event.facts;
  store.saveCheckRequest(event,'matched');event.facts[0].text='tampered';
  expect(store.buildAlertSnapshot('event').facts[0].text).toContain('persisted for 10 seconds');
  expect(store.actOnRequest('event','acknowledged','ack',null).request).toMatchObject({state:'acknowledged',snapshotVersion:2});
  expect(store.actOnRequest('event','acknowledged','ack',null).request.snapshotVersion).toBe(2);
  store.close();stores.splice(stores.indexOf(store),1);const fresh=open(path);
  expect(fresh.getRoomSnapshot().requests[0]).toMatchObject({state:'acknowledged',snapshotVersion:3,location:null});
  expect(fresh.buildAlertSnapshot('event').binding).toBeNull();
  const control={trackId:'track',visitId:visit.id,identityEpoch:'epoch',generation:2};
  expect(fresh.actOnRequest('event','checked','check',control)).toMatchObject({request:{state:'checked',snapshotVersion:4},referenceControl:control});
  expect(fresh.actOnRequest('event','acknowledged','late',null).request.state).toBe('checked');
  expect(()=>fresh.actOnRequest('missing','checked','unknown',null)).toThrowError(expect.objectContaining({status:404}));
  expect(()=>fresh.actOnRequest('event','acknowledged','check',null)).toThrowError(expect.objectContaining({status:409}));
});

it('rejects new questionnaire and contact writes after completion while preserving an identical earlier retry',()=>{
  const store=open(),visit=store.createVisit({requestId:'v'});
  store.saveQuestionnaire(visit.id,{requestId:'a',answers});store.finishVisit(visit.id,'finish');
  expect(()=>store.saveQuestionnaire(visit.id,{requestId:'late',answers:{...answers,reason:'overwrite'}})).toThrowError(expect.objectContaining({code:'VISIT_COMPLETED'}));
  expect(store.saveQuestionnaire(visit.id,{requestId:'a',answers}).answers).toEqual(answers);
});
