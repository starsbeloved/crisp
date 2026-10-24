import { afterEach, expect, it } from 'vitest';
import { createWaitingRoomServer } from '../server/http.ts';
import { listen } from './helpers.ts';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closes.splice(0)) await close(); });
const answers = { reason: 'I feel dizzy', onset: 'today', onsetNote: '', course: 'same' };
async function setup() {
  let time = 100000;
  const app = createWaitingRoomServer({ databasePath: ':memory:', now: () => time });
  closes.push(app.close); const origin = await listen(app.server);
  const call = (path: string, body?: unknown, cookie?: string, method = body === undefined ? 'GET' : 'POST') => fetch(`${origin}/api/wr${path}`, { method, headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const start = await call('/station', {}); const staff = start.headers.get('set-cookie')!.split(';')[0];
  const created = await call('/visits', { requestId: 'visit', preferredName: 'Demo Apple', consent: true }, staff);
  expect(created.status).toBe(201); const visit = await created.json();
  const pair = async (requestId = 'pair') => {
    const r = await call(`/visits/${visit.id}/pair`, { requestId, purpose: 'patient' }, staff);
    expect(r.status).toBe(200); const { code } = await r.json();
    const joined = await call('/join', { code }); expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ visitId: visit.id, purpose: 'patient' });
    return joined.headers.get('set-cookie')!.split(';')[0];
  };
  return { call, staff, visit, pair, advance: (ms: number) => { time += ms; } };
}
it('uses one patient session for its own questionnaire and clock-bound PPG without staff access', async () => {
  const { call, staff, visit, pair } = await setup(); const phone = await pair();
  const own = await call('/patient/session', {}, phone);
  expect(own.status).toBe(200); expect(await own.json()).toMatchObject({ visit: { id: visit.id, preferredName: 'Demo Apple', consentAtMs: 100000 }, canEditQuestionnaire: true, expiresAtMs: 1000000 });
  expect((await call('/room', undefined, phone)).status).toBe(403);
  const other = await (await call('/visits', { requestId: 'other' }, staff)).json();
  expect((await call(`/visits/${other.id}/questionnaire`, { requestId: 'wrong', answers }, phone, 'PUT')).status).toBe(403);
  expect((await call(`/visits/${visit.id}/questionnaire`, { requestId: 'answers', answers }, phone, 'PUT')).status).toBe(200);
  const handshake = await (await call('/clock-sync', { phase: 'start', sourceId: 'phone', runId: 'run', clientSendMs: 10000 }, phone)).json();
  expect((await call('/clock-sync', { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 10000 }, phone)).status).toBe(200);
  const capture = await call('/captures', { requestId: 'capture', sourceId: 'phone', runId: 'run' }, phone);
  expect(capture.status).toBe(200); expect(await capture.json()).toMatchObject({ visitId: visit.id });
  expect((await call('/patient/finish', { requestId: 'finish' }, phone)).status).toBe(409);
});
it('finishes only after saved answers, revokes access and permits only an identical receipt retry', async () => {
  const { call, staff, visit, pair } = await setup(); const phone = await pair();
  expect((await call('/patient/finish', { requestId: 'finish' }, phone)).status).toBe(409);
  await call(`/visits/${visit.id}/questionnaire`, { requestId: 'answers', answers }, phone, 'PUT');
  const receipt = await call('/patient/finish', { requestId: 'finish' }, phone);
  expect(receipt.status).toBe(200); const saved = await receipt.json();
  expect(saved).toEqual({ visitId: visit.id, label: visit.label, completedAtMs: 100000 });
  expect(await (await call('/patient/finish', { requestId: 'finish' }, phone)).json()).toEqual(saved);
  expect((await call('/patient/finish', { requestId: 'different' }, phone)).status).toBe(401);
  expect((await call('/patient/session', {}, phone)).status).toBe(401);
  expect((await call(`/visits/${visit.id}/questionnaire`, { requestId: 'late', answers }, phone, 'PUT')).status).toBe(401);
  expect((await call(`/visits/${visit.id}/pair`, { requestId: 'reopen', purpose: 'patient' }, staff)).status).toBe(409);
  const room = await (await call('/room', undefined, staff)).json();
  expect(room.visits[0]).toMatchObject({ completedAtMs: 100000, answers });
});
it('expires patient access and transfers the questionnaire lease explicitly without silent overwrites', async () => {
  const { call, staff, visit, pair, advance } = await setup(); const phone = await pair();
  expect((await call(`/visits/${visit.id}/questionnaire`, { requestId: 'race', answers }, staff, 'PUT')).status).toBe(409);
  expect((await call(`/visits/${visit.id}/takeover`, { requestId: 'take' }, staff)).status).toBe(200);
  expect((await call(`/visits/${visit.id}/questionnaire`, { requestId: 'late', answers }, phone, 'PUT')).status).toBe(409);
  expect((await call(`/visits/${visit.id}/questionnaire`, { requestId: 'staff', answers }, staff, 'PUT')).status).toBe(200);
  const replacement = await pair('replacement');
  expect((await call('/patient/session', {}, phone)).status).toBe(401);
  expect((await call('/patient/session', {}, replacement)).status).toBe(200);
  advance(900000);
  expect((await call('/patient/session', {}, replacement)).status).toBe(401);
  expect((await call('/captures', { requestId: 'late_capture', sourceId: 'phone', runId: 'run' }, replacement)).status).toBe(401);
});

it('limits a kiosk to its current visit and revokes old phone access when the next person starts', async () => {
  const { call, staff } = await setup();
  const boot = await call('/kiosk', {}); expect(boot.status).toBe(200);
  const kiosk = boot.headers.get('set-cookie')!.split(';')[0];
  expect((await call('/room', undefined, kiosk)).status).toBe(401);
  const create = await call('/kiosk/visit', { requestId:'kvisit',preferredName:'  Green  ',consent:true }, kiosk);
  expect(create.status).toBe(201); const visit = await create.json();
  expect(visit).toMatchObject({preferredName:'Green',consentAtMs:100000});
  expect((await call('/kiosk/visit', {requestId:'another'},kiosk)).status).toBe(409);
  expect((await call('/kiosk/questionnaire',{requestId:'kanswers',answers},kiosk)).status).toBe(200);
  const p = await call('/kiosk/pair',{requestId:'kpair'},kiosk);expect(p.status).toBe(200);
  const pair = await p.json();
  const joined = await call('/join',{code:pair.code});const phone = joined.headers.get('set-cookie')!.split(';')[0];
  expect((await call('/patient/session',{},phone)).status).toBe(200);
  expect((await call('/kiosk/questionnaire',{requestId:'late',answers},kiosk)).status).toBe(409);
  expect((await call('/kiosk/takeover',{requestId:'take'},kiosk)).status).toBe(200);
  expect((await call('/kiosk/questionnaire',{requestId:'again',answers},kiosk)).status).toBe(200);
  expect((await call('/kiosk/reset',{requestId:'reset'},kiosk)).status).toBe(200);
  expect((await call('/patient/session',{},phone)).status).toBe(401);
  expect((await call('/kiosk/session',{},kiosk)).status).toBe(401);
  const room = await (await call('/room',undefined,staff)).json();
  expect(room.visits.find((v:{id:string})=>v.id===visit.id)).toMatchObject({answers});
});

it('revokes kiosk-linked phones and unconsumed grants at kiosk expiry',async()=>{
  const {call,advance}=await setup();
  const boot=await call('/kiosk',{}),kiosk=boot.headers.get('set-cookie')!.split(';')[0];
  await call('/kiosk/visit',{requestId:'kvisit'},kiosk);
  const paired=await (await call('/kiosk/pair',{requestId:'grant'},kiosk)).json();
  advance(100000);const joined=await call('/join',{code:paired.code}),phone=joined.headers.get('set-cookie')!.split(';')[0];
  advance(799000);const pending=await (await call('/kiosk/pair',{requestId:'pending'},kiosk)).json();
  advance(1001);
  expect((await call('/patient/session',{},phone)).status).toBe(401);
  expect((await call('/join',{code:pending.code})).status).toBe(409);
  expect((await call('/kiosk/session',{},kiosk)).status).toBe(401);
});

it('hides completed kiosk answers, limits receipt retries and blocks staff questionnaire overwrites',async()=>{
  const {call,staff}=await setup();const boot=await call('/kiosk',{}),kiosk=boot.headers.get('set-cookie')!.split(';')[0];
  const v=await (await call('/kiosk/visit',{requestId:'kvisit'},kiosk)).json();
  await call('/kiosk/questionnaire',{requestId:'answers',answers},kiosk);
  const finish=await call('/kiosk/finish',{requestId:'finish'},kiosk);expect(finish.status).toBe(200);const receipt=await finish.json();
  expect(await (await call('/kiosk/session',{},kiosk)).json()).toEqual({visit:null,receipt});
  expect(await (await call('/kiosk/finish',{requestId:'finish'},kiosk)).json()).toEqual(receipt);
  expect((await call('/kiosk/finish',{requestId:'different'},kiosk)).status).toBe(409);
  expect((await call('/kiosk/visit',{requestId:'kvisit'},kiosk)).status).toBe(409);
  expect((await call(`/visits/${v.id}/questionnaire`,{requestId:'late',answers:{...answers,reason:'overwritten'}},staff,'PUT')).status).toBe(409);
});

it('returns a minimal kiosk receipt after the paired phone completes, never completed answers',async()=>{
  const {call}=await setup();
  const boot=await call('/kiosk',{}),kiosk=boot.headers.get('set-cookie')!.split(';')[0];
  const visit=await (await call('/kiosk/visit',{requestId:'kvisit'},kiosk)).json();
  const grant=await (await call('/kiosk/pair',{requestId:'pair'},kiosk)).json();
  const join=await call('/join',{code:grant.code}),phone=join.headers.get('set-cookie')!.split(';')[0];
  await call(`/visits/${visit.id}/questionnaire`,{requestId:'answers',answers},phone,'PUT');
  const receipt=await (await call('/patient/finish',{requestId:'finish'},phone)).json();
  expect(await (await call('/kiosk/session',{},kiosk)).json()).toEqual({visit:null,receipt});
  expect((await call('/patient/session',{},phone)).status).toBe(401);
});

it('bounds public pairing attempts for one origin and allows attempts again after the window',async()=>{
  const {call,advance}=await setup();
  for(let i=0;i<10;i++)expect((await call('/join',{code:'00000000'})).status).toBe(409);
  expect((await call('/join',{code:'00000000'})).status).toBe(429);
  advance(60001);expect((await call('/join',{code:'00000000'})).status).toBe(409);
});
it('replaces a legacy questionnaire editor when a new patient grant joins the same visit',async()=>{
  const {call,staff,visit,pair}=await setup();
  const grant=await (await call(`/visits/${visit.id}/pair`,{requestId:'legacy',purpose:'questionnaire'},staff)).json();
  const joined=await call('/join',{code:grant.code}),old=joined.headers.get('set-cookie')!.split(';')[0];
  await pair('patient');
  expect((await call(`/visits/${visit.id}/questionnaire`,{requestId:'late_legacy',answers},old,'PUT')).status).toBe(401);
});
it('scopes kiosk create retries to their own session so another kiosk cannot claim a known request ID',async()=>{
  const {call}=await setup();
  const boot1=await call('/kiosk',{}),first=boot1.headers.get('set-cookie')!.split(';')[0];
  const one=await (await call('/kiosk/visit',{requestId:'same_public_request'},first)).json();
  await call('/kiosk/questionnaire',{requestId:'saved_answers',answers},first);
  const boot2=await call('/kiosk',{}),second=boot2.headers.get('set-cookie')!.split(';')[0];
  const two=await (await call('/kiosk/visit',{requestId:'same_public_request'},second)).json();
  expect(two.id).not.toBe(one.id);
  expect(await (await call('/kiosk/session',{},second)).json()).toMatchObject({visit:{id:two.id,answers:null}});
  expect(await (await call('/kiosk/visit',{requestId:'same_public_request'},second)).json()).toEqual(two);
});
it('reads back only the paired visit contact acquisition and never leaks another visit measurement',async()=>{
  const {call,visit,pair}=await setup();const phone=await pair();
  expect(await (await call('/patient/session',{},phone)).json()).toMatchObject({contactMeasurement:null});
  const h=await (await call('/clock-sync',{phase:'start',sourceId:'readback_phone',runId:'r',clientSendMs:100000},phone)).json();
  const sync=await (await call('/clock-sync',{phase:'complete',handshakeId:h.handshakeId,clientReceiveMs:100000},phone)).json();
  const capture=await (await call('/captures',{requestId:'c',sourceId:'readback_phone',runId:'r'},phone)).json();
  const measurement={schemaVersion:1,id:'contact',sourceId:'readback_phone',runId:'r',seq:1,syncId:sync.id,streamId:'phone',channel:'pulse',method:'phone-camera-contact-ppg',trackId:null,visitId:visit.id,identityEpoch:null,captureId:capture.captureId,sourceStartAtMs:100000,sourceEndAtMs:100000,quality:'usable',value:72,unit:'bpm',provenance:'live_phone',reason:null,metrics:{}};
  expect((await call(`/captures/${capture.captureId}/complete`,{requestId:'complete',measurement},phone)).status).toBe(200);
  const own=await (await call('/patient/session',{},phone)).json();expect(own.contactMeasurement).toMatchObject({id:'contact',visitId:visit.id,value:72,alignedEndAtMs:100000});expect(own).not.toHaveProperty('bindings');
});
