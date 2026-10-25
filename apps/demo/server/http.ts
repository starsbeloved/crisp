import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { NewVisitInput, Observation, RoomState, Visit } from '../shared/types.ts';
import { RoomStore } from './store.ts';
import { MjpegBuffer } from './mjpeg.ts';
import { Orchestrator } from './orchestrator.ts';
import { providerStatus } from './env.ts';
import * as engine from './engine/index.ts';
import * as providers from './providers/index.ts';
import { signedUrl } from './agent.ts';
import { StationRegistry } from './stations.ts';
import { estimateWaitTimes } from './waittime.ts';

const descriptorSchema = z.array(z.number().finite()).min(1).max(512);
const answersSchema = z.object({ reason: z.string().max(4000), reasonChips: z.array(z.string()).max(30), onset: z.enum(['<1h', 'today', '1-3d', 'longer']).nullable(), trend: z.enum(['worse', 'same', 'better']).nullable(), followUp: z.object({ question: z.string(), answer: z.string() }).nullable(), via: z.enum(['form', 'voice']), dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), phone: z.string().max(40).nullable().optional() });
const visitSchema = z.object({ name: z.string().trim().min(1).max(120), descriptor: descriptorSchema.nullable(), answers: answersSchema });
const quality = z.enum(['good', 'fair', 'low', 'none']);
const observationSchema = z.object({
  cameraId: z.string().min(1).max(80), trackId: z.string(), at: z.number().finite(), visitId: z.string().nullable(), matchScore: z.number().finite().nullable(),
  box: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) }),
  hrBpm: z.number().finite().nullable(), hrQuality: quality, rrBpm: z.number().finite().nullable(), rrQuality: quality,
  posture: z.object({ slumpSec: z.number(), headDropSec: z.number(), stillSec: z.number(), fallSuspected: z.boolean() }).nullable(),
  hint: z.string().nullable(), pulseTrace: z.array(z.number().finite()).max(1000).nullable(), source: z.enum(['live', 'replay']),
});
async function readBody(request: IncomingMessage, max = 1_000_000): Promise<Buffer> {
  const parts: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > max) throw new Error('Body too large'); parts.push(Buffer.from(chunk)); }
  return Buffer.concat(parts);
}
async function jsonBody(request: IncomingMessage): Promise<unknown> { return JSON.parse((await readBody(request)).toString('utf8')); }
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value));
}
async function providerResult<T>(work: Promise<T>, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('Provider timeout')), 6000); })]); }
  catch { return fallback(); }
  finally { clearTimeout(timer); }
}
export function createAppServer(options: { dataDir?: string | null; apiPort?: number; webPort?: number; readProviders?: boolean } = {}) {
  const stations = new StationRegistry();
  const store = new RoomStore(options.dataDir === undefined ? resolve('.data') : options.dataDir);
  if (options.readProviders !== false) store.state.providers = providerStatus();
  const mjpeg = new MjpegBuffer();
  const orchestrator = new Orchestrator(store, mjpeg);
  const apiPort = options.apiPort ?? Number(process.env.API_PORT || 8787);
  const webPort = options.webPort ?? Number(process.env.WEB_PORT || 5173);
  function events(response: ServerResponse) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    response.flushHeaders();
    let lastSent = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    function send() {
      timer = undefined; lastSent = Date.now();
      response.write(`event: state\ndata: ${JSON.stringify(store.snapshot())}\n\n`);
    }
    send();
    const unsubscribe = store.subscribe(() => {
      if (timer) return;
      const wait = Math.max(0, 250 - (Date.now() - lastSent));
      if (!wait) send(); else timer = setTimeout(send, wait);
    });
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 10_000);
    response.on('close', () => { unsubscribe(); clearTimeout(timer); clearInterval(heartbeat); });
  }
  const server = createServer((request, response) => {
    void route(request, response).catch(error => {
      if (!response.headersSent) json(response, error instanceof z.ZodError || error instanceof SyntaxError ? 400 : error.message === 'Body too large' ? 413 : 500, { error: error instanceof z.ZodError ? 'Invalid request body' : error instanceof SyntaxError ? 'Invalid JSON' : 'Request failed' });
      else response.end();
    });
  });
  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url || '/', 'http://localhost');
    const path = url.pathname, method = request.method;
    if (method === 'GET' && path === '/api/health') { json(response, 200, { ok: true, serverNow: Date.now() }); return; }
    if (method === 'GET' && path === '/api/events') { events(response); return; }
    if (method === 'GET' && path === '/api/config') { json(response, 200, { apiPort: (server.address() as { port?: number } | null)?.port ?? apiPort, webPort }); return; }
    if (method === 'GET' && path === '/api/gallery') { json(response, 200, store.gallery()); return; }
    if (method === 'POST' && path === '/api/visits') {
      const input: NewVisitInput = visitSchema.parse(await jsonBody(request));
      const visit: Visit = { id: randomUUID(), queueNo: Math.max(0, ...store.state.visits.map(item => item.queueNo)) + 1, name: input.name, createdAt: Date.now(), faceEnrolled: input.descriptor !== null, answers: input.answers, summary: null, status: 'waiting', calledAt: null, room: null };
      store.state.visits.push(visit);
      if (input.descriptor) store.descriptors[visit.id] = [input.descriptor];
      store.changed(); json(response, 201, visit); void orchestrator.onVisit(visit); return;
    }
    const descriptor = path.match(/^\/api\/gallery\/([^/]+)\/descriptor$/);
    if (method === 'POST' && descriptor) {
      const visit = store.state.visits.find(item => item.id === descriptor[1]);
      if (!visit) { json(response, 404, { error: 'Visit not found' }); return; }
      const body = z.object({ descriptor: descriptorSchema }).parse(await jsonBody(request));
      store.descriptors[visit.id] = [...(store.descriptors[visit.id] ?? []), body.descriptor].slice(-5);
      visit.faceEnrolled = true; store.changed(); json(response, 200, { ok: true }); return;
    }
    if (method === 'POST' && path === '/api/observations') {
      const body = z.object({ observations: z.array(observationSchema).max(100) }).parse(await jsonBody(request));
      const result = engine.ingest(store.state, body.observations as Observation[], Date.now());
      store.changed(); json(response, 200, { ok: true }); orchestrator.onAlerts([...result.opened, ...result.updated]); return;
    }
    if (method === 'POST' && path === '/api/frame') {
      if (!request.headers['content-type']?.startsWith('image/jpeg')) { json(response, 415, { error: 'Expected image/jpeg' }); return; }
      const bytes = await readBody(request, 5_000_000);
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) { json(response, 400, { error: 'Expected JPEG frame' }); return; }
      const cameraId = (url.searchParams.get('cam') || 'A').slice(0, 80), now = Date.now();
      const previous = store.state.cameras[cameraId];
      mjpeg.push(cameraId, bytes, now);
      store.state.cameras[cameraId] = { cameraId, lastFrameAt: now, source: url.searchParams.get('source') === 'replay' ? 'replay' : 'live', visible: url.searchParams.get('visible') !== '0', fps: previous && now > previous.lastFrameAt ? Math.min(1000 / (now - previous.lastFrameAt), 60) : 0 };
      store.changed(); json(response, 200, { ok: true }); return;
    }
    if (method === 'GET' && path === '/api/stream.mjpg') { mjpeg.stream(url.searchParams.get('cam') || 'A', response); return; }
    const replay = path.match(/^\/api\/alerts\/([^/]+)\/replay\/(\d+)\.jpg$/);
    if (method === 'GET' && replay) {
      const frame = mjpeg.replay(replay[1], Number(replay[2]));
      if (!frame) { json(response, 404, { error: 'Frame not found' }); return; }
      response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); response.end(frame); return;
    }
    const vision = path.match(/^\/api\/alerts\/([^/]+)\/vision$/);
    if (method === 'POST' && vision) {
      const alert = store.state.alerts.find(item => item.id === vision[1]);
      if (!alert) { json(response, 404, { error: 'Alert not found' }); return; }
      // The frame at the moment the request opened, else the camera's current frame.
      const frame = mjpeg.replay(alert.id, alert.replayFrames - 1) ?? mjpeg.latestFrame(alert.cameraId);
      const result = frame ? await providerResult(providers.describeSnapshot(alert, frame), () => null) : null;
      json(response, result ? 200 : 501, result ?? { error: 'Snapshot description unavailable' }); return;
    }
    const alertAction = path.match(/^\/api\/alerts\/([^/]+)\/(acknowledge|checked)$/);
    if (method === 'POST' && alertAction) {
      const alert = store.state.alerts.find(item => item.id === alertAction[1]);
      if (!alert) { json(response, 404, { error: 'Alert not found' }); return; }
      const now = Date.now();
      if (alertAction[2] === 'checked') { alert.status = 'checked'; alert.checkedAt = now; engine.onChecked(store.state, alert, now); }
      else if (alert.status === 'open') { alert.status = 'acknowledged'; alert.acknowledgedAt = now; }
      alert.updatedAt = now; store.changed(); json(response, 200, alert); return;
    }
    const callIn = path.match(/^\/api\/visits\/([^/]+)\/call-in$/);
    if (method === 'POST' && callIn) {
      const visit = store.state.visits.find(item => item.id === callIn[1]);
      if (!visit) { json(response, 404, { error: 'Visit not found' }); return; }
      const { room } = z.object({ room: z.string().trim().min(1).max(80) }).parse(await jsonBody(request));
      const now = Date.now(); visit.status = 'called'; visit.calledAt = now; visit.room = room;
      const call = { id: randomUUID(), visitId: visit.id, name: visit.name, queueNo: visit.queueNo, room, at: now, audio: 'pending' as const };
      store.state.nowCalling = call; store.changed(); json(response, 200, call); void orchestrator.onCall(call, visit); return;
    }
    const audio = path.match(/^\/api\/(alerts|calls)\/([^/]+)\/audio$/);
    if (method === 'GET' && audio) {
      const bytes = audio[1] === 'alerts' ? orchestrator.getAlertAudio(audio[2]) : orchestrator.getCallAudio(audio[2]);
      if (!bytes) { json(response, 404, { error: 'Audio unavailable' }); return; }
      response.writeHead(200, { 'Content-Type': 'audio/mpeg' }); response.end(bytes); return;
    }
    if (method === 'POST' && path === '/api/checkin/follow-up') {
      const body = z.object({ answers: answersSchema }).parse(await jsonBody(request));
      json(response, 200, await providerResult(providers.followUpQuestion(body.answers), () => ({ question: 'Is there anything else you would like the nurse to know?', source: 'template' as const }))); return;
    }
    if (method === 'POST' && path === '/api/ask') {
      const body = z.object({ question: z.string().min(1).max(4000) }).parse(await jsonBody(request));
      json(response, 200, await providerResult(providers.ask(body.question, store.snapshot()), () => ({ answer: 'Please review the recorded room information.', source: 'template' as const }))); return;
    }
    if (method === 'GET' && path === '/api/agent/signed-url') {
      const mode = url.searchParams.get('mode');
      if (mode !== 'checkin' && mode !== 'nurse') { json(response, 400, { error: 'Expected checkin or nurse mode' }); return; }
      const value = await providerResult(signedUrl(mode), () => null);
      json(response, value ? 200 : 503, value ? { signedUrl: value } : { error: 'Voice agent unavailable' }); return;
    }
    if (method === 'POST' && path === '/api/reference') {
      const body = z.object({ visitId: z.string(), referenceBpm: z.number().finite().positive() }).parse(await jsonBody(request));
      if (!store.state.visits.some(visit => visit.id === body.visitId)) { json(response, 404, { error: 'Visit not found' }); return; }
      const sample = { ...body, at: Date.now(), cameraBpm: store.state.vitals[body.visitId]?.hrBpm ?? null };
      store.state.references.push(sample); store.changed(); json(response, 200, sample); return;
    }
    if (method === 'POST' && path === '/api/reset') {
      const status = store.state.providers; store.reset(); store.state.providers = status; mjpeg.reset(); orchestrator.reset(); json(response, 200, { ok: true }); return;
    }
    if (method === 'GET' && path === '/api/stations') { json(response, 200, { stations: stations.list() }); return; }
    if (method === 'POST' && path === '/api/stations') { json(response, 200, stations.register(await jsonBody(request))); return; }
    if (method === 'GET' && path === '/api/waittime') { json(response, 200, estimateWaitTimes(store.state.visits)); return; }
    if (await (await import('./records.ts')).handleExamRequest(request, response, url, store)) return;
    if (await (await import('./commands.ts')).handleStaffRequest(request, response, url, store, orchestrator)) return;
    json(response, 404, { error: 'Route not found' });
  }
  server.on('close', () => store.flush());
  return { server, store };
}
