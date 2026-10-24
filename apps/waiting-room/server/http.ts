import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Answers, CheckInReceipt, Measurement, QuestionnaireSummary } from '../shared/contracts.ts';
import { answersSchema, idSchema, measurementInputSchema, summarySchema } from '../shared/schemas.ts';
import { canonical, createStore, parse, questionnaireWriteSchema, seatWriteSchema, StoreError } from './store.ts';
import { ClockError, createClockService } from './clock.ts';
import type { ClockPrincipal, FrozenCaptureClock } from './clock.ts';
import { createIngestService } from './ingest.ts';
import { createProviderService } from './providers/service.ts';
import type { ProviderServiceOptions } from './providers/service.ts';
import { ProviderError } from './providers/common.ts';
import {createMediaBroker,MediaError} from './media.ts';

const BODY_LIMIT = 256 * 1024;
function respond(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function error(res: ServerResponse, status: number, code: string, message: string) { respond(res, status, { error: { code, message } }); }
const loopback = (address: string | undefined) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
function localOrigin(req: IncomingMessage, port: number, allowMissingOrigin = false) {
  const host = req.headers.host;
  if (!host || !loopback(req.socket.remoteAddress) || Object.keys(req.headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-'))) return false;
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, '127.0.0.1:5173', 'localhost:5173']);
  return allowed.has(host) && (req.headers.origin === `http://${host}` || (allowMissingOrigin && req.headers.origin === undefined)) && req.headers['sec-fetch-site'] !== 'cross-site';
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += chunk.length; if (size > BODY_LIMIT) throw new StoreError(413, 'BODY_TOO_LARGE', 'Maximum body size is 256 KiB'); chunks.push(Buffer.from(chunk)); }
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new StoreError(400, 'INVALID_BODY', 'Expected JSON object');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new StoreError(400, 'INVALID_JSON', 'Invalid JSON body'); }
}
function cookie(req: IncomingMessage, name: string): string | undefined {
  const matches = req.headers.cookie?.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  return matches?.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}
type Purpose = 'ppg' | 'questionnaire' | 'patient';
type PhoneSession = { id: string; visitId: string; purpose: Purpose; origin: string; expiresAtMs:number; receipt?:{requestId:string;result:CheckInReceipt} };
type Pair = { code: string; visitId: string; purpose: Purpose; expiresAtMs: number; used: boolean };
type Capture = { id: string; sessionId: string; visitId: string; sourceId: string; runId: string; clock: FrozenCaptureClock; state: 'active' | 'cancelled' | 'completed' };
const pairSchema = z.strictObject({ requestId: idSchema, purpose: z.enum(['ppg', 'questionnaire', 'patient']) });
const joinSchema = z.strictObject({ code: z.string().regex(/^\d{8}$/) });
const captureSchema = z.strictObject({ requestId: idSchema, sourceId: idSchema, runId: idSchema });
const completionSchema = z.strictObject({ requestId: idSchema, measurement: measurementInputSchema });
const actionSchema = z.strictObject({ requestId: idSchema });

export function createWaitingRoomServer(opts: { databasePath: string; now?: () => number; phoneOrigins?: readonly string[]; providers?:Pick<ProviderServiceOptions,'explain'|'synthesize'>;summarize?:(answers:Answers,signal:AbortSignal)=>Promise<QuestionnaireSummary> }): { server: import('node:http').Server; close(): Promise<void> } {
  const now = opts.now ?? Date.now;
  const phoneOrigins = new Set((opts.phoneOrigins ?? []).map(origin => {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('phoneOrigins requires exact HTTPS origins');
    return origin;
  }));
  const store = createStore(opts); const clocks = createClockService({ now });
  const sensing=createIngestService({store,clocks,now});
  const media=createMediaBroker({now});
  let stationSession: string | null = null; let stationOrigin: string | null = null;
  let providers:ReturnType<typeof createProviderService>|null=null;
  function providerService(){
    if(!opts.providers)throw new ProviderError('unavailable');
    if(!stationSession)throw new ProviderError('forbidden');
    providers??=createProviderService({...opts.providers,stationId:stationSession,now,getSnapshot:sensing.buildAlertSnapshot,getRoomSnapshot:sensing.getRoomSnapshot});
    return providers;
  }
  function providerRoom(){
    const room=sensing.getRoomSnapshot();
    if(providers&&stationSession){
      providers.updateSnapshot(room);
      room.explanations=Object.fromEntries(room.requests.map(event=>[event.id,providers!.getExplanation(event.id,event.snapshotVersion,stationSession!)]));
      room.audioJobs=providers.listAudioJobs(stationSession);
    }
    return room;
  }
  const phones = new Map<string, PhoneSession>(); const pairs = new Map<string, Pair>();
  const kiosks = new Map<string, { id:string; origin:string; expiresAtMs:number; visitId:string|null; createRequestId?:string; storeCreateRequestId?:string; receipt?:{requestId:string;result:CheckInReceipt} }>();
  const captures = new Map<string, Capture>();
  const editors = new Map<string, string>();
  const joinAttempts=new Map<string,{startAtMs:number;count:number}>();
  function revokeVisit(visitId:string,exceptSessionId?:string){
    for(const pair of pairs.values())if(pair.visitId===visitId)pair.used=true;
    for(const phone of phones.values())if(phone.visitId===visitId && phone.id!==exceptSessionId){cancelUnfinished(phone.id);phones.delete(phone.id);}
    editors.delete(visitId);
  }
  function expireSessions(){
    for(const kiosk of kiosks.values())if(kiosk.expiresAtMs<=now()){
      if(kiosk.visitId)revokeVisit(kiosk.visitId);kiosks.delete(kiosk.id);
    }
    for(const phone of phones.values())if(phone.expiresAtMs<=now()){cancelUnfinished(phone.id);phones.delete(phone.id);}
    for(const [id,attempt] of joinAttempts)if(now()-attempt.startAtMs>=60000)joinAttempts.delete(id);
  }
  function editor(visitId:string) {
    const holder = editors.get(visitId);
    if (holder && holder !== 'station') {
      const session = phones.get(holder);
      if (!session || session.expiresAtMs <= now() || session.receipt) { editors.delete(visitId); return undefined; }
    }
    return holder;
  }
  function cancelUnfinished(sessionId: string) { for (const capture of captures.values()) if (capture.sessionId === sessionId && capture.state === 'active') capture.state = 'cancelled'; }
  const transientRequests = new Map<string, { fingerprint: string; result: unknown }>();
  function transient<T>(requestId: string, operation: string, input: unknown, action: () => T): T {
    const fingerprint = canonical({ operation, input }); const prior = transientRequests.get(requestId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new StoreError(409, 'IDEMPOTENCY_CONFLICT', 'Request ID was already used with different content');
      return structuredClone(prior.result) as T;
    }
    const result = action(); transientRequests.set(requestId, { fingerprint, result: structuredClone(result) }); return result;
  }
  function issuePair(visitId:string, input:z.infer<typeof pairSchema>) {
    if (store.getVisit(visitId).completedAtMs !== null) throw new StoreError(409, 'VISIT_COMPLETED', 'This check-in has ended');
    return transient(input.requestId, 'pair', {visitId,...input}, () => {
      let code:string; do { code=String(randomInt(0,100000000)).padStart(8,'0'); } while(pairs.has(code));
      const pair:Pair={code,visitId,purpose:input.purpose,expiresAtMs:now()+120000,used:false};pairs.set(code,pair);
      return {code,expiresAtMs:pair.expiresAtMs};
    });
  }
  const server = createServer(async (req, res) => {
    try {
      expireSessions();
      const address = server.address(); const port = address && typeof address !== 'string' ? address.port : 8787;
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '');
      const local = localOrigin(req, port, !mutation);
      const phoneOrigin = typeof req.headers.origin === 'string' && phoneOrigins.has(req.headers.origin) && req.headers['sec-fetch-site'] !== 'cross-site';
      if (mutation && !local && !phoneOrigin) return error(res, 403, 'ORIGIN_REJECTED', 'Configured same-origin request required');
      if (req.method === 'GET' && path === '/api/wr/health') return respond(res, 200, { ok: true, serverNowMs: now() });
      if (req.method === 'POST' && path === '/api/wr/kiosk') {
        if (!local) return error(res,403,'ORIGIN_REJECTED','Kiosk setup is local to the laptop');
        parse(z.strictObject({}),await readBody(req));
        const old=kiosks.get(cookie(req,'wr_kiosk')??'');
        const id=old && old.expiresAtMs>now() ? old.id : randomBytes(32).toString('hex');
        if(!kiosks.has(id))kiosks.set(id,{id,origin:req.headers.origin!,expiresAtMs:now()+900000,visitId:null});
        res.setHeader('Set-Cookie',`wr_kiosk=${id}; HttpOnly; SameSite=Strict; Path=/api/wr`);
        return respond(res,200,{ok:true});
      }
      if (req.method === 'POST' && path.startsWith('/api/wr/kiosk/')) {
        const current=()=>{
          const session=kiosks.get(cookie(req,'wr_kiosk')??'');
          if(!local || !session || session.origin!==req.headers.origin || session.expiresAtMs<=now())throw new StoreError(401,'KIOSK_REQUIRED','This check-in station session has ended');
          return session;
        };
        current();const raw=await readBody(req);const session=current();
        const action=path.slice('/api/wr/kiosk/'.length);
        if(action==='session') {
          parse(z.strictObject({}),raw);
          const visit=session.visitId?store.getVisit(session.visitId):null;
          if(visit&&visit.completedAtMs!==null)return respond(res,200,{visit:null,receipt:{visitId:visit.id,label:visit.label,completedAtMs:visit.completedAtMs}});
          return respond(res,200,{visit});
        }
        if(action==='visit') {
          if(session.receipt || session.visitId && store.getVisit(session.visitId).completedAtMs!==null)throw new StoreError(409,'VISIT_COMPLETED','Reset this check-in before starting another');
          if(!raw || typeof raw!=='object' || !('requestId' in raw))throw new StoreError(400,'INVALID_BODY','Request ID required');
          const requestId=parse(idSchema,raw.requestId);
          if(session.visitId && session.createRequestId!==requestId)throw new StoreError(409,'VISIT_ACTIVE','Finish or reset this check-in before starting another');
          // A public retry key is not authority to claim a visit created by another kiosk.
          session.storeCreateRequestId??=randomUUID();
          const visit=store.createVisit({...raw,requestId:session.storeCreateRequestId} as Parameters<typeof store.createVisit>[0]);
          session.visitId=visit.id;session.createRequestId=requestId;return respond(res,201,visit);
        }
        const input=action==='questionnaire'?parse(questionnaireWriteSchema,raw):parse(actionSchema,raw);
        if(action==='reset') {
          if(session.visitId)revokeVisit(session.visitId);
          kiosks.delete(session.id);res.setHeader('Set-Cookie','wr_kiosk=; HttpOnly; SameSite=Strict; Path=/api/wr; Max-Age=0');
          return respond(res,200,{ok:true});
        }
        if(!session.visitId)throw new StoreError(409,'VISIT_REQUIRED','Start a visit first');
        const visit=store.getVisit(session.visitId);
        if(action==='finish') {
          if(session.receipt){
            if(session.receipt.requestId!==input.requestId)throw new StoreError(409,'VISIT_COMPLETED','This check-in has ended');
            return respond(res,200,session.receipt.result);
          }
          if(visit.completedAtMs!==null)throw new StoreError(409,'VISIT_COMPLETED','This check-in has ended');
          if([...captures.values()].some(c=>c.visitId===visit.id&&c.state==='active'))throw new StoreError(409,'CAPTURE_ACTIVE','Stop or save the pulse capture first');
          const completed=store.finishVisit(visit.id,input.requestId);
          revokeVisit(visit.id);
          const result={visitId:visit.id,label:visit.label,completedAtMs:completed.completedAtMs!};session.receipt={requestId:input.requestId,result};
          return respond(res,200,result);
        }
        if(visit.completedAtMs!==null)throw new StoreError(409,'VISIT_COMPLETED','This check-in has ended');
        if(action==='pair')return respond(res,200,issuePair(visit.id,{requestId:input.requestId,purpose:'patient'}));
        if(action==='takeover'){editors.set(visit.id,'station');return respond(res,200,{ok:true});}
        if(action==='questionnaire') {
          if(editor(visit.id)&&editor(visit.id)!=='station')throw new StoreError(409,'EDITOR_CONFLICT','Questions are being edited on the phone; choose Take over first');
          return respond(res,200,store.saveQuestionnaire(visit.id,parse(questionnaireWriteSchema,raw)));
        }
        throw new StoreError(404,'NOT_FOUND','Kiosk action not found');
      }
      if (req.method === 'POST' && path === '/api/wr/station') {
        if (!local) return error(res, 403, 'ORIGIN_REJECTED', 'Local same-origin station request required');
        parse(z.strictObject({}), await readBody(req));
        if (!stationSession || cookie(req, 'wr_station') !== stationSession) {providers?.dispose();providers=null;media.reset();stationSession = randomBytes(32).toString('hex');}
        stationOrigin = req.headers.origin!;
        res.setHeader('Set-Cookie', `wr_station=${stationSession}; HttpOnly; SameSite=Strict; Path=/api/wr`);
        return respond(res, 200, { ok: true });
      }
      const station = () => stationSession !== null && cookie(req, 'wr_station') === stationSession && local && (req.headers.origin === undefined || req.headers.origin === stationOrigin);
      const phone = phones.get(cookie(req, 'wr_phone') ?? '');
      const paired = phone && (req.headers.origin === phone.origin || (!mutation && req.headers.origin === undefined && req.headers.host === new URL(phone.origin).host)) ? phone : undefined;
      function requireStation() {
        if (!station()) throw new StoreError(paired || cookie(req, 'wr_station') === stationSession ? 403 : 401, 'STATION_REQUIRED', 'Local station session required');
      }
      function requireQuestionnaire(visitId: string) {
        if (station()) {
          if (editor(visitId) && editor(visitId) !== 'station') throw new StoreError(409, 'EDITOR_CONFLICT', 'Questionnaire is being edited on the phone; take over explicitly');
          return;
        }
        requireCurrent();
        if (!paired || !['questionnaire','patient'].includes(paired.purpose) || paired.visitId !== visitId) throw new StoreError(403, 'PURPOSE_REJECTED', 'Session is not paired to this questionnaire');
        if (paired.purpose === 'patient' && editor(visitId) !== paired.id) throw new StoreError(409, 'EDITOR_CONFLICT', 'Questionnaire editing moved to the check-in station');
      }
      function requireCurrent(allowReceipt = false):PhoneSession {
        if (!paired || !phones.has(paired.id) || paired.expiresAtMs <= now() || (!allowReceipt && paired.receipt) || (store.getVisit(paired.visitId).completedAtMs!==null && !(allowReceipt && paired.receipt))) {
          if (paired && paired.expiresAtMs <= now()) cancelUnfinished(paired.id);
          throw new StoreError(401, 'SESSION_REQUIRED', 'Check-in session has ended; pair again with staff');
        }
        return paired;
      }
      function requirePatient(allowReceipt = false):PhoneSession {
        const session = requireCurrent(allowReceipt);
        if (session.purpose !== 'patient') throw new StoreError(403, 'PURPOSE_REJECTED', 'Patient check-in pairing required');
        return session;
      }
      function requirePhone(): PhoneSession {
        const session = requireCurrent();
        if (!['ppg','patient'].includes(session.purpose)) throw new StoreError(403, 'PURPOSE_REJECTED', 'PPG pairing required');
        return session;
      }
      function principal(): ClockPrincipal {
        if (station()) return { sessionId: stationSession!, role: 'station', visitId: null };
        const session = requireCurrent();
        return { sessionId: session.id, role: session.purpose, visitId: session.visitId };
      }
      function phonePrincipal(session: PhoneSession): ClockPrincipal { return { sessionId: session.id, role: session.purpose, visitId: session.visitId }; }
      function ownedCapture(id: string, session: PhoneSession): Capture {
        const capture = captures.get(id);
        if (!capture) throw new StoreError(404, 'NOT_FOUND', 'Capture not found');
        if (capture.sessionId !== session.id || capture.visitId !== session.visitId) throw new StoreError(403, 'CAPTURE_SCOPE_MISMATCH', 'Capture belongs to another session');
        return capture;
      }
      if(req.method==='POST' && path==='/api/wr/media'){
        requireStation();const body=await readBody(req);requireStation();
        return respond(res,200,media.handle(stationSession!,body));
      }
      if(req.method==='POST' && path==='/api/wr/questionnaire-summary'){
        const authority=(visitId?:string)=>{
          expireSessions();
          if(station()){
            if(visitId){requireQuestionnaire(visitId);if(store.getVisit(visitId).completedAtMs!==null)throw new StoreError(409,'VISIT_COMPLETED','This check-in has ended');}
            return;
          }
          const kiosk=kiosks.get(cookie(req,'wr_kiosk')??'');
          if(kiosk && local && kiosk.origin===req.headers.origin){
            if(!kiosk.visitId)throw new StoreError(409,'VISIT_REQUIRED','Start a visit first');
            if(visitId && kiosk.visitId!==visitId)throw new StoreError(403,'PURPOSE_REJECTED','This is not the current kiosk visit');
            if(store.getVisit(kiosk.visitId).completedAtMs!==null)throw new StoreError(409,'VISIT_COMPLETED','This check-in has ended');
            if(editor(kiosk.visitId) && editor(kiosk.visitId)!=='station')throw new StoreError(409,'EDITOR_CONFLICT','Questions are being edited on the phone');
            return;
          }
          const session=requireCurrent();requireQuestionnaire(visitId??session.visitId);
        };
        authority();const input=parse(z.strictObject({visitId:idSchema,answers:answersSchema}),await readBody(req));authority(input.visitId);
        if(!opts.summarize)throw new ProviderError('unavailable');
        const controller=new AbortController();const abort=()=>controller.abort();res.once('close',abort);
        try {
          const proposal=await opts.summarize(input.answers,controller.signal);authority(input.visitId);
          const summary=parse(summarySchema,proposal);
          if(summary.confirmed)throw new ProviderError('invalid-output');
          return respond(res,200,summary);
        }finally{res.off('close',abort);}
      }
      if (req.method === 'GET' && path === '/api/wr/room') { requireStation(); return respond(res, 200, providerRoom()); }
      const providerRoute=/^\/api\/wr\/requests\/([A-Za-z0-9_-]{1,96})\/(explain|speech)$/.exec(path);
      if(req.method==='POST'&&providerRoute){
        requireStation();
        const input=parse(z.strictObject({snapshotVersion:z.number().int().positive()}),await readBody(req));requireStation();
        const service=providerService(),stationId=stationSession!;
        const result=providerRoute[2]==='speech'?await service.requestSpeech(providerRoute[1],input.snapshotVersion,stationId):await service.requestExplanation(providerRoute[1],input.snapshotVersion,stationId);
        requireStation();return respond(res,200,result);
      }
      const audioRoute=/^\/api\/wr\/audio\/([A-Za-z0-9_-]{1,96})$/.exec(path);
      if(req.method==='GET'&&audioRoute){
        requireStation();const bytes=providerService().readAudio(audioRoute[1],stationSession!);
        res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;
      }
      if(req.method==='POST' && (path==='/api/wr/bindings' || path==='/api/wr/observations')){
        requireStation();const body=await readBody(req);requireStation();
        const result=path==='/api/wr/bindings'?sensing.updateBindings(principal(),body):sensing.ingestObservations(principal(),body);
        providers?.updateSnapshot(sensing.getRoomSnapshot());return respond(res,200,result);
      }
      const requestRoute=/^\/api\/wr\/requests\/([A-Za-z0-9_-]+)\/(acknowledge|check)$/.exec(path);
      if(req.method==='POST' && requestRoute){
        requireStation();const input=parse(actionSchema,await readBody(req));requireStation();
        const result=requestRoute[2]==='check'?sensing.markChecked(requestRoute[1],input.requestId):sensing.acknowledge(requestRoute[1],input.requestId);
        providers?.updateSnapshot(sensing.getRoomSnapshot());return respond(res,200,result);
      }
      if (req.method === 'POST' && path === '/api/wr/visits') {
        requireStation(); const body = await readBody(req); requireStation();
        return respond(res, 201, store.createVisit(body as Parameters<typeof store.createVisit>[0]));
      }
      if (req.method === 'POST' && path === '/api/wr/patient/session') {
        requirePatient(); parse(z.strictObject({}), await readBody(req)); const session = requirePatient();
        const contactMeasurement=store.getRoomSnapshot().measurements.filter(m=>m.visitId===session.visitId && m.streamId==='phone').sort((a,b)=>a.alignedEndAtMs-b.alignedEndAtMs).at(-1)??null;
        return respond(res, 200, { visit: store.getVisit(session.visitId), expiresAtMs:session.expiresAtMs, canEditQuestionnaire:editor(session.visitId) === session.id,contactMeasurement });
      }
      if (req.method === 'POST' && path === '/api/wr/patient/finish') {
        requirePatient(true); const input = parse(actionSchema, await readBody(req)); const session = requirePatient(true);
        if (session.receipt) {
          if (session.receipt.requestId !== input.requestId) throw new StoreError(401, 'SESSION_REQUIRED', 'Check-in session has ended');
          return respond(res, 200, session.receipt.result);
        }
        if ([...captures.values()].some(c => c.sessionId === session.id && c.state === 'active')) throw new StoreError(409, 'CAPTURE_ACTIVE', 'Stop or save the active pulse measurement first');
        const visit = store.finishVisit(session.visitId, input.requestId);
        const result = { visitId:visit.id, label:visit.label, completedAtMs:visit.completedAtMs! };
        session.receipt = { requestId:input.requestId, result };
        revokeVisit(visit.id,session.id);
        return respond(res, 200, result);
      }
      const visitRoute = /^\/api\/wr\/visits\/([A-Za-z0-9_-]+)\/(questionnaire|seat|pair|takeover)$/.exec(path);
      if (visitRoute) {
        const [, visitId, action] = visitRoute;
        if (req.method === 'POST' && action === 'takeover') {
          requireStation(); const input = parse(actionSchema, await readBody(req)); requireStation(); store.getVisit(visitId);
          const result = transient(input.requestId, 'takeover', {visitId}, () => { editors.set(visitId, 'station'); return { ok:true }; });
          return respond(res, 200, result);
        }
        if (req.method === 'PUT' && action === 'questionnaire') {
          requireQuestionnaire(visitId);
          const input = parse(questionnaireWriteSchema, await readBody(req)); requireQuestionnaire(visitId);
          return respond(res, 200, store.saveQuestionnaire(visitId, input));
        }
        if (req.method === 'PUT' && action === 'seat') {
          requireStation(); const input = parse(seatWriteSchema, await readBody(req)); requireStation();
          return respond(res, 200, store.assignSeat(visitId, input));
        }
        if (req.method === 'POST' && action === 'pair') {
          requireStation(); const input = parse(pairSchema, await readBody(req)); requireStation(); store.getVisit(visitId);
          const result = issuePair(visitId,input);
          return respond(res, 200, result);
        }
      }
      if (req.method === 'POST' && path === '/api/wr/join') {
        const attemptKey=JSON.stringify([req.socket.remoteAddress,req.headers.origin]);
        const attempt=joinAttempts.get(attemptKey)??{startAtMs:now(),count:0};
        if(attempt.count>=10)throw new StoreError(429,'PAIR_RATE_LIMIT','Too many pairing attempts; wait a minute and try again');
        attempt.count++;joinAttempts.set(attemptKey,attempt);
        const input = parse(joinSchema, await readBody(req)); const pair = pairs.get(input.code);
        if (!pair || pair.expiresAtMs <= now()) throw new StoreError(409, 'PAIR_EXPIRED', 'Pairing code is invalid or expired');
        if (pair.used) throw new StoreError(409, 'PAIR_USED', 'Pairing code has already been used');
        if (store.getVisit(pair.visitId).completedAtMs !== null) throw new StoreError(409, 'VISIT_COMPLETED', 'This check-in has ended');
        const old = cookie(req, 'wr_phone'); if (old) { cancelUnfinished(old); phones.delete(old); }
        if (pair.purpose === 'patient') for (const session of phones.values()) if (session.visitId === pair.visitId) { cancelUnfinished(session.id); phones.delete(session.id); }
        const id = randomBytes(32).toString('hex');
        phones.set(id, { id, visitId: pair.visitId, purpose: pair.purpose, origin: req.headers.origin!, expiresAtMs:now() + 900000 }); pair.used = true;
        if (pair.purpose === 'patient') editors.set(pair.visitId, id);
        res.setHeader('Set-Cookie', `wr_phone=${id}; HttpOnly; SameSite=Strict; Path=/api/wr${phoneOrigin ? '; Secure' : ''}`);
        return respond(res, 200, { visitId: pair.visitId, purpose: pair.purpose });
      }
      if (req.method === 'POST' && path === '/api/wr/clock-sync') {
        principal(); const body = await readBody(req); const identity = principal();
        if (!body || typeof body !== 'object' || !('phase' in body)) throw new StoreError(400, 'INVALID_BODY', 'Clock phase required');
        if (body.phase === 'start') return respond(res, 200, clocks.start(identity, body));
        if (body.phase === 'complete') return respond(res, 200, clocks.complete(identity, body));
        throw new StoreError(400, 'INVALID_BODY', 'Unknown clock phase');
      }
      if (req.method === 'POST' && path === '/api/wr/captures') {
        requirePhone(); const input = parse(captureSchema, await readBody(req)); const session = requirePhone();
        const result = transient(input.requestId, 'capture', { sessionId: session.id, ...input }, () => {
          const id = randomUUID();
          const frozen = clocks.freezeCapture(phonePrincipal(session), { captureId: id, visitId: session.visitId, sourceId: input.sourceId, runId: input.runId });
          cancelUnfinished(session.id);
          captures.set(id, { id, sessionId: session.id, visitId: session.visitId, sourceId: input.sourceId, runId: input.runId, clock: frozen, state: 'active' });
          return { captureId: id, visitId: session.visitId };
        });
        return respond(res, 200, result);
      }
      const captureRoute = /^\/api\/wr\/captures\/([A-Za-z0-9_-]+)\/(complete|cancel)$/.exec(path);
      if (req.method === 'POST' && captureRoute) {
        requirePhone(); const raw = await readBody(req); const session = requirePhone();
        const [, captureId, action] = captureRoute; const capture = ownedCapture(captureId, session);
        if (action === 'cancel') {
          const input = parse(actionSchema, raw);
          const result = transient(input.requestId, 'cancelCapture', { sessionId: session.id, captureId, ...input }, () => {
            if (capture.state === 'completed') throw new StoreError(409, 'CAPTURE_COMPLETED', 'Completed capture cannot be cancelled');
            capture.state = 'cancelled'; return { cancelled: true as const };
          });
          return respond(res, 200, result);
        }
        const input = parse(completionSchema, raw); const m = input.measurement;
        const result = transient(input.requestId, 'completeCapture', { sessionId: session.id, captureId, ...input }, () => {
          if (capture.state === 'cancelled') throw new StoreError(409, 'CAPTURE_CANCELLED', 'Capture cancelled; result was not saved');
          if (capture.state === 'completed') throw new StoreError(409, 'CAPTURE_COMPLETED', 'Capture already completed using another request ID');
          if (now() > capture.clock.expiresAtMs) throw new StoreError(409, 'CAPTURE_EXPIRED', 'Capture expired; result was not saved');
          if (m.visitId !== capture.visitId || m.captureId !== capture.id || m.sourceId !== capture.sourceId || m.runId !== capture.runId) throw new StoreError(403, 'CAPTURE_SCOPE_MISMATCH', 'Measurement differs from original capture');
          if (m.streamId !== 'phone' || m.provenance !== 'live_phone') throw new StoreError(400, 'INVALID_MEASUREMENT', 'Only live phone contact measurements are accepted');
          const alignment = clocks.alignCaptureInterval(phonePrincipal(session), capture.clock, { syncId: m.syncId, sourceId: m.sourceId, runId: m.runId, sourceStartAtMs: m.sourceStartAtMs, sourceEndAtMs: m.sourceEndAtMs });
          const measurement: Measurement = { ...m, alignedStartAtMs: alignment.alignedStartAtMs, alignedEndAtMs: alignment.alignedEndAtMs, receivedAtMs: alignment.receivedAtMs };
          const saved = store.saveContactMeasurement({ requestId: input.requestId, measurement });
          capture.state = 'completed'; return saved;
        });
        return respond(res, 200, result);
      }
      return error(res, 404, 'NOT_FOUND', 'Route not found');
    } catch (cause) {
      if(cause instanceof MediaError)return error(res,cause.status,cause.code,cause.message);
      if(cause instanceof ProviderError)return error(res,cause.code==='forbidden'?403:cause.code==='ineligible'?409:cause.code==='expired'?410:cause.code==='invalid-input'?400:503,`PROVIDER_${cause.code.replaceAll('-','_').toUpperCase()}`,cause.message);
      if (cause instanceof StoreError || cause instanceof ClockError) return error(res, cause.status, cause.code, cause.message);
      return error(res, 503, 'SERVICE_UNAVAILABLE', 'Local service could not complete the request');
    }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  let closed = false;
  return { server, close: async () => {
    providers?.dispose();providers=null;media.reset();
    stationSession = null; phones.clear(); pairs.clear(); kiosks.clear(); joinAttempts.clear(); captures.clear(); transientRequests.clear(); clocks.dispose();
    if (server.listening) await new Promise<void>((resolve, reject) => { server.close(e => e ? reject(e) : resolve()); server.closeIdleConnections(); });
    if (!closed) { store.close(); closed = true; }
  } };
}
