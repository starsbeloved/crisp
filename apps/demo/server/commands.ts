import { randomUUID } from 'node:crypto';
import type { NowCalling, Visit } from '../shared/types.ts';
import type { RoomStore } from './store.ts';
import { onChecked } from './engine/index.ts';
import { recordForVisit } from './records.ts';

export interface CommandResult { ok: boolean; message: string; data?: unknown; choices?: { name: string; queueNo: number; id: string }[] }
const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export const normalizeStaffRoom = (room: string) => room.trim().replace(/^room\s*/i, '').trim();
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
  shiftSummary?: () => Promise<CommandResult>;
}
export class StaffCommands {
  constructor(private store: RoomStore, private hooks: CommandHooks) {}
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
    if (!['patient_summary', 'get_record', 'call_patient', 'acknowledge_request', 'mark_checked'].includes(tool)) return { ok: false, message: 'Unknown staff tool.' };
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) return { ok: false, message: 'Please say the patient name.' };
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
      return { ok: true, message: record.record ? `${record.allergyText}. ${record.label}.` : `${record.message}. ${record.label}.`, data: record };
    }
    if (visit.status !== 'waiting') return { ok: false, message: `${visit.name} is no longer waiting. Please review the visit on screen.` };
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
