import { normalizeRoom } from '../client/staff/rooms.ts';
import { randomUUID } from 'node:crypto';
import type { NowCalling, Visit } from '../shared/types.ts';
import type { RoomStore } from './store.ts';
import { onChecked } from './engine/index.ts';
import { recordForVisit, recordReadBack, getRecord } from './records.ts';

export interface CommandResult { ok: boolean; message: string; data?: unknown; choices?: { name: string; queueNo: number; id: string }[] }
const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export const normalizeStaffRoom = normalizeRoom;
export function matchPatient(visits: Visit[], name: string): { visit?: Visit; choices: Visit[] } {
  const needle = normalized(name);
  if (!needle) return { choices: [] };
  const exact = visits.filter(visit => normalized(visit.name) === needle);
  const choices = exact.length ? exact : visits.filter(visit => normalized(visit.name).startsWith(needle));
  return { ...(choices.length === 1 ? { visit: choices[0] } : {}), choices };
}
interface CommandHooks {
  onCall: (call: NowCalling, visit: Visit) => Promise<void>;
  onChecked?: (visitId: string, now: number) => void;
  acceptSuggestion?: (id?: string) => Promise<CommandResult>;
  removePatient?: (visit: Visit, now: number) => CommandResult;
  shiftSummary?: () => Promise<CommandResult>;
}
export class StaffCommands {
  private store: RoomStore;
  private hooks: CommandHooks;
  constructor(store: RoomStore, hooks: CommandHooks) { this.store = store; this.hooks = hooks; }
  async run(tool: string, parameters: unknown, now = Date.now()): Promise<CommandResult> {
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return { ok: false, message: 'Expected tool parameters as an object.' };
    const input = parameters as Record<string, unknown>;
    if (tool === 'accept_suggestion') {
      if (input.id !== undefined && (typeof input.id !== 'string' || !input.id.trim())) return { ok: false, message: 'Expected a suggestion id.' };
      return this.hooks.acceptSuggestion?.(input.id as string | undefined) ?? { ok: false, message: 'No suggestion is available.' };
    }
    if (tool === 'shift_summary') return this.hooks.shiftSummary?.() ?? this.summary(now);
    if (tool === 'list_waiting') {
      const waiting = this.store.state.visits.filter(visit => visit.status === 'waiting').sort((a, b) => a.createdAt - b.createdAt || a.queueNo - b.queueNo)
        .map(visit => ({ id: visit.id, name: visit.name, queueNo: visit.queueNo, waitedMin: Math.max(0, Math.floor((now - visit.createdAt) / 60_000)) }));
      return { ok: true, message: waiting.length ? `${waiting.length} waiting: ${waiting.map(v => `${v.name}, number ${v.queueNo}`).join('; ')}.` : 'No one is waiting.', data: { waiting } };
    }
    if (!['patient_summary', 'get_record', 'call_patient', 'acknowledge_request', 'mark_checked', 'remove_patient'].includes(tool)) return { ok: false, message: 'Unknown staff tool.' };
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) return { ok: false, message: 'Please say the patient name.' };
    if (tool === 'get_record' && (input.room !== undefined || input.visitId !== undefined)) {
      if ((input.room !== undefined && typeof input.room !== 'string') || (input.visitId !== undefined && typeof input.visitId !== 'string')) return { ok: false, message: 'Expected room and visitId as text.' };
      const result = getRecord(this.store.state.visits, { name: input.name, room: input.room as string | undefined, visitId: input.visitId as string | undefined });
      return { ok: Boolean(result.visitId), message: recordReadBack(input.name, result), data: result };
    }
    // Resolve across all visits: do not silently select one of two identical names based on queue status.
    const match = matchPatient(this.store.state.visits, input.name);
    if (!match.visit) return { ok: false, message: match.choices.length ? `Which patient? ${match.choices.map(v => `${v.name}, number ${v.queueNo}`).join('; ')}. Use a full unique name, or select the visit on screen.` : 'No patient matches that name. Please repeat the full name.',
      choices: match.choices.map(({ name, queueNo, id }) => ({ name, queueNo, id })) };
    const visit = match.visit;
    if (tool === 'patient_summary') {
      const vitals = this.store.state.vitals[visit.id];
      const fresh = vitals && now - vitals.lastSeenAt < 5000;
      return { ok: true, message: `${visit.name}, number ${visit.queueNo}. Patient reported: ${visit.answers.reason || 'No reason recorded'}.`, data: {
        id: visit.id, name: visit.name, queueNo: visit.queueNo, status: visit.status, room: visit.room, answers: visit.answers, summary: visit.summary,
        cameraEstimates: vitals ? { label: 'Camera estimates', source: vitals.source, lastSeenAt: vitals.lastSeenAt, stale: !fresh,
          hrBpm: fresh && ['good', 'fair'].includes(vitals.hrQuality) ? vitals.hrBpm : null, hrQuality: vitals.hrQuality,
          rrBpm: fresh && ['good', 'fair'].includes(vitals.rrQuality) ? vitals.rrBpm : null, rrQuality: vitals.rrQuality } : null,
        requests: this.store.state.alerts.filter(a => a.visitId === visit.id).map(a => ({ level: a.level, status: a.status, reasons: a.reasons, openedAt: a.openedAt })),
      } };
    }
    if (tool === 'get_record') {
      const record = recordForVisit(visit);
      return { ok: true, message: recordReadBack(visit.name, record), data: record };
    }
    if (visit.status !== 'waiting') return { ok: false, message: `${visit.name} is no longer waiting. Please review the visit on screen.` };
    if (tool === 'remove_patient') {
      if (this.hooks.removePatient) return this.hooks.removePatient(visit, now);
      visit.status = 'called'; visit.room = null;
      if (this.store.state.nowCalling?.visitId === visit.id) this.store.state.nowCalling = null;
      this.store.changed();
      return { ok: true, message: `${visit.name} removed from queue after staff confirmation. Record retained.` };
    }
    if (tool === 'call_patient') {
      if (typeof input.room !== 'string' || !normalizeStaffRoom(input.room) || input.room.length > 80) return { ok: false, message: 'Which room? Please give a room name or number.' };
      return this.call(visit, normalizeStaffRoom(input.room), now);
    }
    const alert = this.store.state.alerts.filter(a => a.visitId === visit.id && a.status !== 'checked').sort((a, b) => b.openedAt - a.openedAt)[0];
    if (!alert && tool === 'acknowledge_request') return { ok: false, message: `No active request for ${visit.name}.` };
    if (alert) {
      if (tool === 'mark_checked') { alert.status = 'checked'; alert.checkedAt = now; onChecked(this.store.state, alert, now); }
      else if (alert.status === 'open') { alert.status = 'acknowledged'; alert.acknowledgedAt = now; }
      alert.updatedAt = now;
    }
    if (tool === 'mark_checked') this.hooks.onChecked?.(visit.id, now);
    this.store.changed();
    return { ok: true, message: tool === 'mark_checked' ? `Marked ${visit.name} checked.` : `Acknowledged the request for ${visit.name}.` };
  }
  call(visit: Visit, room: string, now = Date.now()): CommandResult {
    room = normalizeStaffRoom(room);
    if (!room) return { ok: false, message: 'Which room? Please give a room name or number.' };
    if (visit.status !== 'waiting') return { ok: false, message: `${visit.name} is no longer waiting.` };
    if (this.store.state.visits.some(v => v.status === 'called' && v.room && normalized(normalizeStaffRoom(v.room)) === normalized(room))) return { ok: false, message: `Room ${room} is occupied. Please choose another room or mark its patient done.` };
    visit.status = 'called'; visit.room = room; visit.calledAt = now;
    const call: NowCalling = { id: randomUUID(), visitId: visit.id, name: visit.name, queueNo: visit.queueNo, room, at: now, audio: 'pending' };
    this.store.state.nowCalling = call; this.store.changed();
    void this.hooks.onCall(call, visit).catch(() => { /* Orchestrator owns its normal audio/handoff fallback. */ });
    return { ok: true, message: `Calling ${visit.name} to Room ${room}.`, data: call };
  }
  summary(now = Date.now()): CommandResult {
    const waiting = this.store.state.visits.filter(v => v.status === 'waiting');
    const active = this.store.state.alerts.filter(a => a.status !== 'checked' && waiting.some(v => v.id === a.visitId));
    const longest = waiting.length ? Math.max(...waiting.map(v => Math.max(0, Math.floor((now - v.createdAt) / 60_000)))) : 0;
    return { ok: true, message: `Recorded shift summary: ${waiting.length} waiting; ${active.length} requests awaiting a check; longest wait ${longest} minutes.`, data: { source: 'template', waiting: waiting.length, activeRequests: active.length, longestWaitMin: longest } };
  }
}

// Appended route handler: the frozen route table and shared state shape remain intact.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Orchestrator } from './orchestrator.ts';
import { ProactiveAgent } from './proactive.ts';
import * as providers from './providers/index.ts';
const services = new WeakMap<RoomStore, { commands: StaffCommands; proactive: ProactiveAgent }>();
function staffServices(store: RoomStore, orchestrator: Orchestrator) {
  let service = services.get(store);
  if (service) return service;
  const commands: StaffCommands = new StaffCommands(store, {
    onCall: (call, visit) => orchestrator.onCall(call, visit),
    removePatient: (visit, now) => proactive.removePatient(visit, now),
    onChecked: (id, now) => proactive.noteChecked(id, now),
    acceptSuggestion: id => proactive.accept(id),
    shiftSummary: () => proactive.shiftSummary(async () => {
      const fallback = commands.summary();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          providers.ask('Summarize this shift using only the recorded waiting-room events. State waiting count, outstanding human checks and arrival order. No diagnosis, clinical ranking or recommendations. Label camera readings as estimates and replay as REPLAY.', store.snapshot()),
          new Promise<{ answer: string; source: 'template' }>(resolve => { timer = setTimeout(() => resolve({ answer: fallback.message, source: 'template' }), 6000); }),
        ]);
      } catch { return { answer: fallback.message, source: 'template' as const }; }
      finally { clearTimeout(timer); }
    }),
  });
  const proactive: ProactiveAgent = new ProactiveAgent(store, { call: (visit, room) => commands.call(visit, room) });
  service = { commands, proactive }; services.set(store, service); return service;
}
export async function handleStaffRequest(request: IncomingMessage, response: ServerResponse, url: URL, store: RoomStore, orchestrator: Orchestrator): Promise<boolean> {
  const command = url.pathname.match(/^\/api\/commands\/([a-z_]+)$/);
  const removal = url.pathname.match(/^\/api\/visits\/([^/]+)\/remove$/);
  const relevant = request.method === 'POST' && (command || removal || url.pathname === '/api/checkin/help' || url.pathname === '/api/suggestions/dismiss' || url.pathname === '/api/exam/patient-done') ||
    request.method === 'GET' && ['/api/suggestions', '/api/hallway/check-back'].includes(url.pathname);
  if (!relevant) return false;
  const { commands, proactive } = staffServices(store, orchestrator);
  const send = (status: number, data: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); return true; };
  if (request.method === 'GET') return send(200, url.pathname === '/api/suggestions' ? proactive.list() : { messages: proactive.hallway() });
  if (url.pathname === '/api/checkin/help') return send(200, proactive.requestHelp());
  if (removal) {
    const visit = store.state.visits.find(visit => visit.id === removal[1]);
    if (!visit) return send(404, { ok: false, message: 'Visit not found.' });
    const result = proactive.removePatient(visit);
    return send(result.ok ? 200 : 422, result);
  }
  let body = ''; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size <= 8000) body += chunk.toString(); }
  if (size > 8000) return send(413, { ok: false, message: 'Body too large.' });
  let input: unknown;
  try { input = JSON.parse(body); } catch { return send(400, { ok: false, message: 'Invalid JSON.' }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return send(400, { ok: false, message: 'Expected parameters as an object.' });
  if (command) { const result = await commands.run(command[1], input); return send(result.ok ? 200 : 422, result); }
  const values = input as Record<string, unknown>;
  if (url.pathname === '/api/suggestions/dismiss') {
    if (typeof values.id !== 'string') return send(400, { ok: false, message: 'Suggestion id is required.' });
    const result = proactive.dismiss(values.id); return send(result.ok ? 200 : 422, result);
  }
  if (typeof values.room !== 'string' || !values.room.trim() || typeof values.visitId !== 'string') return send(400, { ok: false, message: 'Room and current visitId are required.' });
  const result = proactive.patientDone(values.room, values.visitId); return send(result.ok ? 200 : 422, result);
}

export function resetStaffServices(store: RoomStore) { services.delete(store); }
