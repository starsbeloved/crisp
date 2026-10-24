import { afterEach, expect, it } from 'vitest';
import { createWaitingRoomServer } from '../server/http.ts';
import { listen, rawRequest } from './helpers.ts';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import type { Measurement } from '../shared/contracts.ts';
import { request } from 'node:http';
const closes: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closes.splice(0)) await close(); });
async function start(opts: { databasePath?: string; now?: () => number; phoneOrigins?: readonly string[] } = {}) { const app = createWaitingRoomServer({ databasePath: ':memory:', now: () => 123456, ...opts }); closes.push(app.close); return { ...app, origin: await listen(app.server) }; }
async function call(origin: string, path: string, body?: unknown, cookie?: string, method = body === undefined ? 'GET' : 'POST', requestOrigin = origin) {
  return fetch(`${origin}/api/wr${path}`, { method, headers: { Origin: requestOrigin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function station(origin: string) { const res = await call(origin, '/station', {}); expect(res.status).toBe(200); return res.headers.get('set-cookie')!.split(';')[0]; }
async function visit(origin: string, cookie: string, requestId: string) { const res = await call(origin, '/visits', { requestId }, cookie); expect(res.status).toBe(201); return res.json(); }
const answers = { reason: 'Original reported concern', onset: 'today', onsetNote: 'morning', course: 'same' };
async function pairedPhone(origin: string, stationCookie: string, visitId: string, requestId = 'pair', previous?: string) {
  const paired = await call(origin, `/visits/${visitId}/pair`, { requestId, purpose: 'ppg' }, stationCookie);
  expect(paired.status).toBe(200); const { code } = await paired.json();
  const joined = await call(origin, '/join', { code }, previous); expect(joined.status).toBe(200);
  return joined.headers.get('set-cookie')!.split(';')[0];
}
async function synchronize(origin: string, phone: string, clientTime = 10000, sourceId = 'phone', runId = 'run') {
  const start = await call(origin, '/clock-sync', { phase: 'start', sourceId, runId, clientSendMs: clientTime }, phone);
  expect(start.status).toBe(200); const handshake = await start.json();
  const complete = await call(origin, '/clock-sync', { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: clientTime }, phone);
  expect(complete.status).toBe(200); return complete.json();
}
async function capture(origin: string, phone: string, requestId = 'capture', sourceId = 'phone', runId = 'run') {
  const res = await call(origin, '/captures', { requestId, sourceId, runId }, phone); expect(res.status).toBe(200); return res.json();
}
function measurement(visitId: string, captureId: string, syncId: string): Omit<Measurement, 'alignedStartAtMs' | 'alignedEndAtMs' | 'receivedAtMs'> {
  return { schemaVersion: 1, id: `m_${captureId}`, sourceId: 'phone', runId: 'run', seq: 1, syncId, streamId: 'phone', channel: 'pulse', method: 'phone-camera-contact-ppg', trackId: null, visitId, identityEpoch: null, captureId, sourceStartAtMs: 10000, sourceEndAtMs: 40000, quality: 'usable', value: 72, unit: 'bpm', provenance: 'live_phone', reason: null, metrics: { usableMs: 30000 } };
}
async function pendingWrite(app: Awaited<ReturnType<typeof start>>, path: string, cookie: string, body: unknown) {
  const observed = new Promise<void>(resolve => app.server.once('request', () => resolve()));
  let finish!: () => void;
  const status = new Promise<number>((resolve, reject) => {
    const req = request(`${app.origin}/api/wr${path}`, { method: 'PUT', headers: { Origin: app.origin, Cookie: cookie, 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
    req.on('error', reject); const text = JSON.stringify(body); req.write(text.slice(0, 1)); finish = () => req.end(text.slice(1));
  });
  await observed; return { finish, status };
}
it('serves health using server time and returns typed 404 for unrelated routes', async () => {
  const { origin } = await start();
  const health = await fetch(`${origin}/api/wr/health`);
  expect(await health.json()).toEqual({ ok: true, serverNowMs: 123456 });
  expect(health.headers.get('cache-control')).toBe('no-store');
  const miss = await fetch(`${origin}/api/wr/not-real`);
  expect(miss.status).toBe(404);
  expect(await miss.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

it('ingests authenticated camera observations, persists deterministic requests and returns fresh check controls',async()=>{
  let time=100000;const dir=mkdtempSync(join(process.cwd(),'.local/test-runs/backend-P2A/http-events-')),databasePath=join(dir,'retained.sqlite');
  const app=await start({databasePath,now:()=>time}),cookie=await station(app.origin),v=await visit(app.origin,cookie,'camera_visit');
  const sync=await synchronize(app.origin,cookie,10000,'camera','room_run');
  expect((await call(app.origin,'/observations',{measurements:[],poses:[]})).status).toBe(401);
  const phone=await pairedPhone(app.origin,cookie,v.id);expect((await call(app.origin,'/bindings',{},phone)).status).toBe(403);
  for(let i=0;i<=21;i++){
    time=100000+i*1000;const sourceAtMs=10000+i*1000;
    const bindings={schemaVersion:1,id:`binding_${i}`,sourceId:'camera',runId:'room_run',streamId:'binding',seq:i,syncId:sync.id,sourceAtMs,
      bindings:[{trackId:'track',visitId:v.id,identityEpoch:'epoch',state:'matched',sourceSinceAtMs:10000,sourceLastVerifiedAtMs:sourceAtMs,bounds:{x:.1,y:.1,width:.3,height:.5},observedLocation:{label:'Window side',sourceObservedAtMs:sourceAtMs}}]};
    expect((await call(app.origin,'/bindings',bindings,cookie)).status).toBe(200);
    const pose={schemaVersion:1,id:`pose_${i}`,sourceId:'camera',runId:'room_run',streamId:'pose',seq:i,syncId:sync.id,sourceAtMs,referenceGeneration:1,trackId:'track',visitId:v.id,identityEpoch:'epoch',quality:'usable',provenance:'live_camera',activity:'stationary',seated:true,qualifyingSlump:i>=11,referenceReady:true,reason:null,features:{}};
    const response=await call(app.origin,'/observations',{measurements:[],poses:[pose]},cookie);
    expect(response.status).toBe(200);expect(await response.json()).toEqual({accepted:1,duplicates:0,rejected:0});
  }
  const room=await (await call(app.origin,'/room',undefined,cookie)).json();expect(room.requests).toHaveLength(1);
  const eventId=room.requests[0].id;
  expect((await call(app.origin,`/requests/${eventId}/acknowledge`,{requestId:'ack'},phone)).status).toBe(403);
  const ack=await call(app.origin,`/requests/${eventId}/acknowledge`,{requestId:'ack'},cookie);expect(ack.status).toBe(200);expect(await ack.json()).toMatchObject({state:'acknowledged',snapshotVersion:2});
  const checked=await call(app.origin,`/requests/${eventId}/check`,{requestId:'check'},cookie);expect(checked.status).toBe(200);
  expect(await checked.json()).toMatchObject({request:{state:'checked',snapshotVersion:3},referenceControl:{trackId:'track',visitId:v.id,identityEpoch:'epoch',generation:2}});
  expect((await call(app.origin,'/requests/missing/check',{requestId:'unknown'},cookie)).status).toBe(404);
  time+=1001;const stale=await (await call(app.origin,'/room',undefined,cookie)).json();expect(stale.cameraState).toBe('stale');expect(stale.requests[0].state).toBe('checked');
  await app.close();closes.splice(closes.indexOf(app.close),1);
  const fresh=await start({databasePath,now:()=>time}),freshCookie=await station(fresh.origin);
  const restored=await (await call(fresh.origin,'/room',undefined,freshCookie)).json();expect(restored).toMatchObject({cameraState:'off',bindings:[],audioJobs:[],requests:[{id:eventId,state:'checked'}]});
});
it('requires explicit same-origin local station creation and sets protected cookie', async () => {
  const { origin } = await start();
  const get = await fetch(`${origin}/api/wr/station`);
  expect(get.status).toBe(404);
  const res = await fetch(`${origin}/api/wr/station`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).toContain('Path=/api/wr');
});
it('rejects foreign, missing, null origins and forwarded station creation without a cookie', async () => {
  const { origin } = await start();
  for (const headers of [{ Origin: 'https://foreign.example' }, {}, { Origin: 'null' }, { Origin: origin, 'X-Forwarded-Host': 'phone.local' }, { Origin: origin, 'X-Forwarded-For': '192.168.1.5' }] as Array<Record<string,string>>) {
    const res = await fetch(`${origin}/api/wr/station`, { method: 'POST', headers });
    expect(res.status, JSON.stringify(headers)).toBe(403); expect(res.headers.get('set-cookie')).toBe(null);
    expect((await res.json()).error.code).toBe('ORIGIN_REJECTED');
  }
  const foreignHost = await rawRequest(`${origin}/api/wr/station`, { Origin: origin, Host: 'phone.local', 'Content-Type': 'application/json' });
  expect(foreignHost.status).toBe(403);
  const mutation = await fetch(`${origin}/api/wr/visits`, { method: 'POST', headers: { Origin: 'https://foreign.example' } });
  expect(mutation.status).toBe(403);
});
it('rejects malformed and oversized station bodies without creating a session', async () => {
  const { origin } = await start();
  for (const [body,status] of [['{',400], ['x'.repeat(262145),413]] as const) {
    const res = await fetch(`${origin}/api/wr/station`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
    expect(res.status).toBe(status); expect(res.headers.get('set-cookie')).toBe(null);
  }
});

it('persists two distinct visits, questionnaire confirmation and assigned seats through service restart', async () => {
  const dir = mkdtempSync(join(process.cwd(), '.local/test-runs/backend-P2A/http-'));
  const databasePath = join(dir, 'retained.sqlite');
  const app = await start({ databasePath }); const cookie = await station(app.origin);
  const first = await visit(app.origin, cookie, 'first'); const second = await visit(app.origin, cookie, 'second');
  expect(second.id).not.toBe(first.id);
  const proposal = { complaint: 'Proposed concern', onset: 'today', course: 'same', confirmed: false };
  const form = await call(app.origin, `/visits/${first.id}/questionnaire`, { requestId: 'form', answers, summary: proposal }, cookie, 'PUT');
  expect(form.status).toBe(200); expect(await form.json()).toMatchObject({ answers, summary: proposal });
  const confirmed = { ...proposal, complaint: 'Patient corrected words', confirmed: true };
  expect((await call(app.origin, `/visits/${first.id}/questionnaire`, { requestId: 'confirm', answers, summary: confirmed }, cookie, 'PUT')).status).toBe(200);
  expect((await call(app.origin, `/visits/${first.id}/seat`, { requestId: 'seat', label: 'B4' }, cookie, 'PUT')).status).toBe(200);
  await app.close();
  const fresh = await start({ databasePath }); const newCookie = await station(fresh.origin);
  expect((await call(fresh.origin, '/room', undefined, cookie)).status).toBe(401);
  const room = await (await call(fresh.origin, '/room', undefined, newCookie)).json();
  expect(room.visits).toHaveLength(2);
  expect(room.visits.find((v: {id:string}) => v.id === first.id)).toMatchObject({ answers, summary: confirmed, assignedSeat: { label: 'B4' } });
  expect(room.visits.find((v: {id:string}) => v.id === second.id)).toMatchObject({ answers: null, summary: null, assignedSeat: null });
  expect(room).toMatchObject({ cameraState: 'off', bindings: [] });
  const duplicate = await call(fresh.origin, '/visits', { requestId: 'first' }, newCookie);
  expect(await duplicate.json()).toEqual(first);
});

it('enforces station role, bounded questionnaire fields, unknown visits and idempotency conflicts', async () => {
  const { origin } = await start();
  expect((await call(origin, '/visits', { requestId: 'unauthorized' })).status).toBe(401);
  expect((await call(origin, '/room')).status).toBe(401);
  const cookie = await station(origin); const first = await visit(origin, cookie, 'first');
  expect((await call(origin, '/visits', { requestId: 'first', label: 'changed' }, cookie)).status).toBe(409);
  expect((await call(origin, `/visits/${first.id}/questionnaire`, { requestId: 'long', answers: { ...answers, reason: 'x'.repeat(501) } }, cookie, 'PUT')).status).toBe(400);
  expect((await call(origin, `/visits/${first.id}/questionnaire`, { requestId: 'max', answers: { ...answers, reason: 'x'.repeat(500) } }, cookie, 'PUT')).status).toBe(200);
  expect((await call(origin, '/visits/missing/seat', { requestId: 'missing', label: null }, cookie, 'PUT')).status).toBe(404);
  const cleared = await call(origin, `/visits/${first.id}/seat`, { requestId: 'clear', label: null }, cookie, 'PUT');
  expect((await cleared.json()).assignedSeat).toBeNull();
  expect((await call(origin, `/visits/${first.id}/seat`, { requestId: 'foreign', label: 'A1' }, cookie, 'PUT', 'https://foreign.example')).status).toBe(403);
  const oversized = await call(origin, `/visits/${first.id}/questionnaire`, { requestId: 'oversized', answers: { ...answers, reason: 'x'.repeat(262145) } }, cookie, 'PUT');
  expect(oversized.status).toBe(413);
});

it('issues single-use eight-digit pairing codes with an exact 120-second expiry', async () => {
  let clock = 100000; const { origin } = await start({ now: () => clock }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first');
  const pair = await (await call(origin, `/visits/${first.id}/pair`, { requestId: 'pair', purpose: 'ppg' }, cookie)).json();
  expect(pair.code).toMatch(/^\d{8}$/); expect(pair.expiresAtMs).toBe(220000);
  const duplicate = await call(origin, `/visits/${first.id}/pair`, { requestId: 'pair', purpose: 'ppg' }, cookie);
  expect(await duplicate.json()).toEqual(pair);
  expect((await call(origin, `/visits/${first.id}/pair`, { requestId: 'pair', purpose: 'questionnaire' }, cookie)).status).toBe(409);
  const joined = await call(origin, '/join', { code: pair.code });
  expect(joined.status).toBe(200); expect(await joined.json()).toEqual({ visitId: first.id, purpose: 'ppg' });
  const phoneCookie = joined.headers.get('set-cookie')!;
  expect(phoneCookie).toContain('HttpOnly'); expect(phoneCookie).toContain('SameSite=Strict');
  expect((await call(origin, '/join', { code: pair.code })).status).toBe(409);
  const expiry = await (await call(origin, `/visits/${first.id}/pair`, { requestId: 'expiry', purpose: 'ppg' }, cookie)).json();
  clock = 220000;
  expect((await call(origin, '/join', { code: expiry.code })).status).toBe(409);
});

it('invalidates unused pairing codes and paired sessions after restart while keeping visits', async () => {
  const dir = mkdtempSync(join(process.cwd(), '.local/test-runs/backend-P2A/pair-restart-'));
  const databasePath = join(dir, 'retained.sqlite'); const app = await start({ databasePath });
  const cookie = await station(app.origin); const first = await visit(app.origin, cookie, 'first');
  const pair = await (await call(app.origin, `/visits/${first.id}/pair`, { requestId: 'pair', purpose: 'questionnaire' }, cookie)).json();
  const used = await (await call(app.origin, `/visits/${first.id}/pair`, { requestId: 'used', purpose: 'questionnaire' }, cookie)).json();
  const joined = await call(app.origin, '/join', { code: used.code }); const phone = joined.headers.get('set-cookie')!.split(';')[0];
  await app.close(); const fresh = await start({ databasePath });
  expect((await call(fresh.origin, '/join', { code: pair.code })).status).toBe(409);
  expect((await call(fresh.origin, `/visits/${first.id}/questionnaire`, { requestId: 'old', answers }, phone, 'PUT')).status).toBe(401);
  const freshStation = await station(fresh.origin);
  expect((await (await call(fresh.origin, '/room', undefined, freshStation)).json()).visits).toHaveLength(1);
});

it('does not disclose role-protected data on originless browser GETs and rejects foreign-origin reads', async () => {
  const { origin } = await start(); const cookie = await station(origin); await visit(origin, cookie, 'first');
  const own = await fetch(`${origin}/api/wr/room`, { headers: { Cookie: cookie } });
  expect(own.status).toBe(200); expect((await own.json()).visits).toHaveLength(1);
  const foreign = await fetch(`${origin}/api/wr/room`, { headers: { Cookie: cookie, Origin: 'https://foreign.example' } });
  expect(foreign.status).toBe(403); expect((await foreign.json()).visits).toBeUndefined();
  expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
});

it('bounds questionnaire cookies to the paired visit and rejects PPG, room and station privileges', async () => {
  const { origin } = await start(); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first'); const second = await visit(origin, cookie, 'second');
  const pair = await (await call(origin, `/visits/${first.id}/pair`, { requestId: 'pair', purpose: 'questionnaire' }, cookie)).json();
  const joined = await call(origin, '/join', { code: pair.code });
  const phone = joined.headers.get('set-cookie')!.split(';')[0];
  const saved = await call(origin, `/visits/${first.id}/questionnaire`, { requestId: 'form', answers }, phone, 'PUT');
  expect(saved.status).toBe(200);
  expect((await call(origin, `/visits/${second.id}/questionnaire`, { requestId: 'wrong', answers }, phone, 'PUT')).status).toBe(403);
  expect((await call(origin, '/room', undefined, phone)).status).toBe(403);
  expect((await call(origin, '/captures', { requestId: 'capture', sourceId: 'phone', runId: 'run' }, phone)).status).toBe(403);
  expect((await call(origin, `/visits/${first.id}/seat`, { requestId: 'seat', label: 'B4' }, phone, 'PUT')).status).toBe(403);
  const otherPair = await (await call(origin, `/visits/${second.id}/pair`, { requestId: 'newpair', purpose: 'ppg' }, cookie)).json();
  await call(origin, '/join', { code: otherPair.code }, phone);
  expect((await call(origin, `/visits/${first.id}/questionnaire`, { requestId: 'old', answers }, phone, 'PUT')).status).toBe(401);
});

it('accepts only explicitly configured phone origins and never grants station through an HTTPS loopback proxy', async () => {
  const phoneOrigin = 'https://phone.demo.local:5173';
  const { origin } = await start({ phoneOrigins: [phoneOrigin] }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first');
  const pair = await (await call(origin, `/visits/${first.id}/pair`, { requestId: 'pair', purpose: 'ppg' }, cookie)).json();
  const joined = await call(origin, '/join', { code: pair.code }, undefined, 'POST', phoneOrigin);
  expect(joined.status).toBe(200); expect(joined.headers.get('set-cookie')).toContain('Secure');
  const phone = joined.headers.get('set-cookie')!.split(';')[0];
  expect((await call(origin, '/station', {}, phone, 'POST', phoneOrigin)).status).toBe(403);
  expect((await call(origin, '/station', {}, cookie, 'POST', phoneOrigin)).status).toBe(403);
  expect((await call(origin, '/room', undefined, phone, 'GET', phoneOrigin)).status).toBe(403);
  expect((await call(origin, '/room', undefined, cookie, 'GET', phoneOrigin)).status).toBe(403);
  expect((await call(origin, '/visits', { requestId: 'phonevisit' }, phone, 'POST', phoneOrigin)).status).toBe(403);
  expect((await call(origin, '/join', { code: pair.code }, undefined, 'POST', 'https://unconfigured.local')).status).toBe(403);
});

it('binds clock handshakes to authenticated role/session and rejects client-supplied server stamps', async () => {
  const { origin } = await start({ now: () => 100000 }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first'); const second = await visit(origin, cookie, 'second');
  const phoneA = await pairedPhone(origin, cookie, first.id, 'pairA'); const phoneB = await pairedPhone(origin, cookie, second.id, 'pairB');
  expect((await call(origin, '/clock-sync', { phase: 'start', sourceId: 'phone', runId: 'run', clientSendMs: 10000 })).status).toBe(401);
  const started = await call(origin, '/clock-sync', { phase: 'start', sourceId: 'phone', runId: 'run', clientSendMs: 10000 }, phoneA);
  expect(started.status).toBe(200); const handshake = await started.json();
  expect((await call(origin, '/clock-sync', { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 10000 }, phoneB)).status).toBe(403);
  expect((await call(origin, '/clock-sync', { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 10000, serverReceiveMs: 0 }, phoneA)).status).toBe(400);
  const completed = await call(origin, '/clock-sync', { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 10000 }, phoneA);
  expect(completed.status).toBe(200); expect(await completed.json()).toMatchObject({ sourceId: 'phone', runId: 'run', offsetMs: 90000, uncertaintyMs: 0 });
});

it('saves a capture to its immutable visit with source provenance and survives service restart', async () => {
  let clock = 100000; const dir = mkdtempSync(join(process.cwd(), '.local/test-runs/backend-P2A/capture-'));
  const databasePath = join(dir, 'retained.sqlite'); const app = await start({ databasePath, now: () => clock }); const cookie = await station(app.origin);
  const first = await visit(app.origin, cookie, 'first'); const second = await visit(app.origin, cookie, 'second');
  const phone = await pairedPhone(app.origin, cookie, first.id); const sync = await synchronize(app.origin, phone);
  const started = await capture(app.origin, phone); expect(started.visitId).toBe(first.id);
  const input = measurement(first.id, started.captureId, sync.id); clock = 130000;
  const saved = await call(app.origin, `/captures/${started.captureId}/complete`, { requestId: 'complete', measurement: input }, phone);
  expect(saved.status).toBe(200); const result = await saved.json();
  expect(result).toEqual({ ...input, alignedStartAtMs: 100000, alignedEndAtMs: 130000, receivedAtMs: 130000 });
  clock = 900000;
  expect(await (await call(app.origin, `/captures/${started.captureId}/complete`, { requestId: 'complete', measurement: input }, phone)).json()).toEqual(result);
  expect((await call(app.origin, `/captures/${started.captureId}/complete`, { requestId: 'complete', measurement: { ...input, value: 99 } }, phone)).status).toBe(409);
  await app.close(); const fresh = await start({ databasePath, now: () => clock }); const freshStation = await station(fresh.origin);
  const room = await (await call(fresh.origin, '/room', undefined, freshStation)).json();
  expect(room.measurements).toEqual([result]); expect(room.measurements[0].visitId).not.toBe(second.id);
  expect((await call(fresh.origin, `/captures/${started.captureId}/complete`, { requestId: 'complete', measurement: input }, phone)).status).toBe(401);
});

it('rejects visit/source/run/sync substitution and injected alignment in capture completion', async () => {
  let clock = 100000; const { origin } = await start({ now: () => clock }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first'); const second = await visit(origin, cookie, 'second');
  const phone = await pairedPhone(origin, cookie, first.id); const sync = await synchronize(origin, phone); const started = await capture(origin, phone);
  const input = measurement(first.id, started.captureId, sync.id); clock = 130000;
  for (const changed of [{ visitId: second.id }, { captureId: 'other' }, { sourceId: 'other' }, { runId: 'other' }, { syncId: 'other' }, { provenance: 'synthetic' }, { alignedEndAtMs: 130000 }, { receivedAtMs: 130000 }]) {
    const res = await call(origin, `/captures/${started.captureId}/complete`, { requestId: 'bad', measurement: { ...input, ...changed } }, phone);
    expect([400, 403, 409]).toContain(res.status);
  }
  expect((await call(origin, `/captures/${started.captureId}/complete`, { requestId: 'good', measurement: input }, phone)).status).toBe(200);
});

it('cancels unfinished captures explicitly, on a new capture and when the phone joins another visit/purpose', async () => {
  let clock = 100000; const { origin } = await start({ now: () => clock }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first'); const second = await visit(origin, cookie, 'second');
  const phone = await pairedPhone(origin, cookie, first.id); const sync = await synchronize(origin, phone); const a = await capture(origin, phone);
  const cancel = await call(origin, `/captures/${a.captureId}/cancel`, { requestId: 'cancel' }, phone);
  expect(cancel.status).toBe(200); expect(await cancel.json()).toEqual({ cancelled: true });
  expect((await call(origin, `/captures/${a.captureId}/cancel`, { requestId: 'cancel' }, phone)).status).toBe(200);
  const b = await capture(origin, phone, 'next'); const c = await capture(origin, phone, 'newest'); clock = 130000;
  for (const started of [a, b]) expect((await call(origin, `/captures/${started.captureId}/complete`, { requestId: `finish_${started.captureId}`, measurement: measurement(first.id, started.captureId, sync.id) }, phone)).status).toBe(409);
  const phoneB = await pairedPhone(origin, cookie, second.id, 'pairB', phone);
  expect((await call(origin, `/captures/${c.captureId}/complete`, { requestId: 'old', measurement: measurement(first.id, c.captureId, sync.id) }, phone)).status).toBe(401);
  expect((await call(origin, `/captures/${c.captureId}/complete`, { requestId: 'redirect', measurement: measurement(second.id, c.captureId, sync.id) }, phoneB)).status).toBe(403);
  expect((await (await call(origin, '/room', undefined, cookie)).json()).measurements).toEqual([]);
});

it('allows bounded historical completion with the frozen mapping but rejects expired or out-of-capture intervals', async () => {
  let clock = 100000; const { origin } = await start({ now: () => clock }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first'); const phone = await pairedPhone(origin, cookie, first.id);
  const sync = await synchronize(origin, phone); const started = await capture(origin, phone); const input = measurement(first.id, started.captureId, sync.id);
  clock = 500000;
  for (const changed of [{ sourceStartAtMs: 9999 }, { sourceEndAtMs: 70001 }]) {
    const rejected = await call(origin, `/captures/${started.captureId}/complete`, { requestId: 'bad', measurement: { ...input, ...changed } }, phone);
    expect(rejected.status).toBe(400); expect((await rejected.json()).error.code).toBe('CLOCK_CAPTURE_INTERVAL');
  }
  const historical = await call(origin, `/captures/${started.captureId}/complete`, { requestId: 'historical', measurement: input }, phone);
  expect(historical.status).toBe(200); expect(await historical.json()).toMatchObject({ alignedStartAtMs: 100000, alignedEndAtMs: 130000, receivedAtMs: 500000 });
  expect((await call(origin, '/captures', { requestId: 'no_fresh_sync', sourceId: 'phone', runId: 'run' }, phone)).status).toBe(409);
  // Renew the session so this case isolates capture expiry, not the new session TTL.
  const renewed = await pairedPhone(origin, cookie, first.id, 'renewed-pair', phone);
  const freshSync = await synchronize(origin, renewed, 410000); const expired = await capture(origin, renewed, 'expired'); clock = 1100001;
  const result = await call(origin, `/captures/${expired.captureId}/complete`, { requestId: 'too_late', measurement: { ...measurement(first.id, expired.captureId, freshSync.id), sourceStartAtMs: 410000, sourceEndAtMs: 440000 } }, renewed);
  expect(result.status).toBe(409); expect((await result.json()).error.code).toBe('CAPTURE_EXPIRED');
});

it('requires a fresh authenticated PPG clock before capture and never consumes an ID on a failed start', async () => {
  const { origin } = await start({ now: () => 100000 }); const cookie = await station(origin); const first = await visit(origin, cookie, 'first');
  const phone = await pairedPhone(origin, cookie, first.id);
  expect((await call(origin, '/captures', { requestId: 'capture', sourceId: 'phone', runId: 'run' }, phone)).status).toBe(409);
  await synchronize(origin, phone);
  const firstCapture = await capture(origin, phone);
  expect(await capture(origin, phone)).toEqual(firstCapture);
  expect((await call(origin, '/captures', { requestId: 'capture', sourceId: 'changed', runId: 'run' }, phone)).status).toBe(409);
  expect((await call(origin, '/captures', { requestId: 'other', sourceId: 'phone', runId: 'unbound_run' }, phone)).status).toBe(409);
  expect((await call(origin, '/captures/missing/cancel', { requestId: 'cancel' }, phone)).status).toBe(404);
  expect((await call(origin, `/captures/${firstCapture.captureId}/cancel`, { requestId: 'cancel' }, cookie)).status).toBe(401);
});

it('keeps later rechecks as new readings and rejects cancellation or a second commit of a completed capture', async () => {
  let clock = 100000; const { origin } = await start({ now: () => clock }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first'); const phone = await pairedPhone(origin, cookie, first.id);
  const sync = await synchronize(origin, phone); const a = await capture(origin, phone); clock = 130000;
  const input = measurement(first.id, a.captureId, sync.id);
  expect((await call(origin, `/captures/${a.captureId}/complete`, { requestId: 'finishA', measurement: input }, phone)).status).toBe(200);
  expect((await call(origin, `/captures/${a.captureId}/complete`, { requestId: 'differentCommit', measurement: input }, phone)).status).toBe(409);
  expect((await call(origin, `/captures/${a.captureId}/cancel`, { requestId: 'cancelDone' }, phone)).status).toBe(409);
  const syncB = await synchronize(origin, phone, 40000); const b = await capture(origin, phone, 'recheck'); clock = 160000;
  const recheck = { ...measurement(first.id, b.captureId, syncB.id), seq: 2, sourceStartAtMs: 40000, sourceEndAtMs: 70000, quality: 'low-quality', value: null, reason: 'Insufficient signal' };
  const saved = await call(origin, `/captures/${b.captureId}/complete`, { requestId: 'finishB', measurement: recheck }, phone);
  expect(saved.status).toBe(200);
  const room = await (await call(origin, '/room', undefined, cookie)).json();
  expect(room.measurements).toHaveLength(2);
  expect(room.measurements[0]).toMatchObject({ value: 72, captureId: a.captureId });
  expect(room.measurements[1]).toMatchObject({ value: null, quality: 'low-quality', captureId: b.captureId });
});

it('keeps the original capture clock mapping when a later synchronization changes the offset', async () => {
  let clock = 100000; const { origin } = await start({ now: () => clock }); const cookie = await station(origin);
  const first = await visit(origin, cookie, 'first'); const phone = await pairedPhone(origin, cookie, first.id);
  const original = await synchronize(origin, phone); const started = await capture(origin, phone);
  clock = 150000; const newer = await synchronize(origin, phone, 61000); expect(newer.offsetMs).toBe(89000);
  const originalInput = measurement(first.id, started.captureId, original.id);
  const changed = await call(origin, `/captures/${started.captureId}/complete`, { requestId: 'new_mapping', measurement: { ...originalInput, syncId: newer.id } }, phone);
  expect(changed.status).toBe(403); expect((await changed.json()).error.code).toBe('CLOCK_SCOPE_MISMATCH');
  const saved = await call(origin, `/captures/${started.captureId}/complete`, { requestId: 'original_mapping', measurement: originalInput }, phone);
  expect(saved.status).toBe(200); expect(await saved.json()).toMatchObject({ syncId: original.id, alignedStartAtMs: 100000, alignedEndAtMs: 130000, receivedAtMs: 150000 });
});

it('rechecks questionnaire authority after body arrival if the phone changes purpose during upload', async () => {
  const app = await start(); const cookie = await station(app.origin); const first = await visit(app.origin, cookie, 'first');
  const pair = await (await call(app.origin, `/visits/${first.id}/pair`, { requestId: 'form_pair', purpose: 'questionnaire' }, cookie)).json();
  const joined = await call(app.origin, '/join', { code: pair.code }); const phone = joined.headers.get('set-cookie')!.split(';')[0];
  const pending = await pendingWrite(app, `/visits/${first.id}/questionnaire`, phone, { requestId: 'pending_form', answers });
  await pairedPhone(app.origin, cookie, first.id, 'new_ppg_pair', phone);
  pending.finish(); expect(await pending.status).toBe(401);
  const room = await (await call(app.origin, '/room', undefined, cookie)).json(); expect(room.visits[0].answers).toBeNull();
});

it('rejects a pending station write after its station session is replaced', async () => {
  const app = await start(); const cookie = await station(app.origin); const first = await visit(app.origin, cookie, 'first');
  const pending = await pendingWrite(app, `/visits/${first.id}/seat`, cookie, { requestId: 'pending_seat', label: 'B4' });
  const replacement = await station(app.origin);
  pending.finish(); expect(await pending.status).toBe(401);
  const room = await (await call(app.origin, '/room', undefined, replacement)).json(); expect(room.visits[0].assignedSeat).toBeNull();
});

it('authenticates media signaling and resets transient peers when station authority changes',async()=>{
  const app=await start(),cookie=await station(app.origin);
  const register={action:'register',clientId:'publisher',role:'publisher'};
  expect((await call(app.origin,'/media',register)).status).toBe(401);
  expect((await call(app.origin,'/media',register,cookie)).status).toBe(200);
  expect((await call(app.origin,'/media',{action:'register',clientId:'receiver',role:'receiver'},cookie)).status).toBe(200);
  const inbox=await call(app.origin,'/media',{action:'poll',clientId:'publisher',afterSeq:0},cookie);
  expect(await inbox.json()).toMatchObject({events:[{type:'peer',peerId:'receiver',role:'receiver'}]});
  const v=await visit(app.origin,cookie,'media_visit'),phone=await pairedPhone(app.origin,cookie,v.id);
  expect((await call(app.origin,'/media',{action:'register',clientId:'phone_view',role:'receiver'},phone)).status).toBe(403);
  const replacement=await station(app.origin);
  expect((await call(app.origin,'/media',{action:'poll',clientId:'publisher',afterSeq:0},cookie)).status).toBe(401);
  expect((await call(app.origin,'/media',{action:'poll',clientId:'publisher',afterSeq:0},replacement)).status).toBe(410);
});
