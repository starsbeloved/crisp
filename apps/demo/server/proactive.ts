import { randomUUID } from 'node:crypto';
import type { RoomState, Visit } from '../shared/types.ts';
import type { RoomStore } from './store.ts';
import type { CommandResult } from './commands.ts';

export type SuggestionKind = 'room_free' | 'long_wait' | 'may_have_left' | 'chart_ready' | 'shift_summary' | 'check_back';
export interface Suggestion {
  id: string; kind: SuggestionKind; text: string; createdAt: number; visitId?: string; room?: string;
  action?: 'call' | 'remind' | 'left' | 'hallway'; source?: 'gemini' | 'template';
}
export interface Disposition { status: 'done' | 'left'; at: number; name: string; queueNo: number; room: string | null }
export interface SuggestionState { suggestions: Suggestion[]; dispositions: Record<string, Disposition> }
type Entry = Suggestion & { key: string; status: 'pending' | 'accepted' | 'dismissed' | 'expired'; acceptedAt?: number };
const roomKey = (room: string) => room.trim().replace(/^room\s*/i, '').trim().toLowerCase();
const roomLabel = (room: string | null | undefined) => !room ? 'the room' : /^room\b/i.test(room.trim()) ? room.trim() : `Room ${room.trim()}`;

export class ProactiveAgent {
  private entries: Entry[] = [];
  private rooms = new Map<string, number>();
  private checked = new Set<string>();
  private dispositions: Record<string, Disposition> = {};
  private state: RoomState;
  private store: RoomStore;
  private actions: { call: (visit: Visit, room: string) => CommandResult };
  constructor(store: RoomStore, actions: { call: (visit: Visit, room: string) => CommandResult }) { this.store = store; this.actions = actions; this.state = store.state; }
  private sync() {
    if (this.state === this.store.state) return;
    this.state = this.store.state; this.entries = []; this.rooms.clear(); this.checked.clear(); this.dispositions = {};
  }
  private waiting() { return this.store.state.visits.filter(v => v.status === 'waiting').sort((a, b) => a.createdAt - b.createdAt || a.queueNo - b.queueNo); }
  private occupied(room: string) { return this.store.state.visits.some(v => v.status === 'called' && v.room && roomKey(v.room) === roomKey(room)); }
  private valid(entry: Entry, now: number): boolean {
    const visit = this.store.state.visits.find(v => v.id === entry.visitId);
    if (entry.kind === 'shift_summary') return true;
    if (entry.kind === 'chart_ready') return Boolean(visit?.status === 'called' && visit.room === entry.room && this.store.state.handoffs[visit.id]);
    if (!visit || visit.status !== 'waiting') return false;
    if (entry.kind === 'room_free') return Boolean(entry.room && !this.occupied(entry.room) && this.waiting()[0]?.id === visit.id);
    if (entry.kind === 'long_wait') return now - visit.createdAt > 45 * 60_000 && visit.answers.trend === 'worse' && !this.wasChecked(visit.id);
    if (entry.kind === 'may_have_left') { const seen = this.store.state.vitals[visit.id]?.lastSeenAt; return seen !== undefined && now - seen >= 10 * 60_000; }
    return now - visit.createdAt >= 30 * 60_000;
  }
  private wasChecked(id: string) { return this.checked.has(id) || this.store.state.alerts.some(a => a.visitId === id && a.status === 'checked'); }
  private propose(key: string, suggestion: Omit<Suggestion, 'id'>) {
    // A dismissed/accepted event stays handled. Expired events may recur after a genuine condition change.
    if (this.entries.some(e => e.key === key && e.status !== 'expired')) return;
    this.entries.push({ ...suggestion, key, id: randomUUID(), status: 'pending' });
  }
  list(now = Date.now()): SuggestionState {
    this.sync();
    for (const entry of this.entries) if (entry.status === 'pending' && !this.valid(entry, now)) entry.status = 'expired';
    const next = this.waiting()[0];
    for (const [room, freedAt] of this.rooms) {
      if (!next || this.occupied(room)) continue;
      this.propose(`room:${room}:${freedAt}:${next.id}`, { kind: 'room_free', text: `${roomLabel(room)} is free. Next by arrival is ${next.name} (#${next.queueNo}). Call them?`, action: 'call', visitId: next.id, room, createdAt: now });
    }
    for (const visit of this.store.state.visits) {
      if (visit.status === 'called' && visit.room && this.store.state.handoffs[visit.id]) this.propose(`chart:${visit.id}:${visit.calledAt}`, { kind: 'chart_ready', text: `${visit.name}'s chart is ready in ${roomLabel(visit.room)}.`, visitId: visit.id, room: visit.room, createdAt: now });
      if (visit.status !== 'waiting') continue;
      const minutes = Math.max(0, Math.floor((now - visit.createdAt) / 60_000));
      if (now - visit.createdAt > 45 * 60_000 && visit.answers.trend === 'worse' && !this.wasChecked(visit.id)) this.propose(`wait:${visit.id}`, { kind: 'long_wait', text: `${visit.name} has waited ${minutes} min and reported getting worse. Want to check on them?`, visitId: visit.id, action: 'remind', createdAt: now });
      const seen = this.store.state.vitals[visit.id]?.lastSeenAt;
      if (seen !== undefined && now - seen >= 10 * 60_000) this.propose(`left:${visit.id}:${seen}`, { kind: 'may_have_left', text: `${this.store.state.vitals[visit.id]?.source === 'replay' ? 'REPLAY · ' : ''}${visit.name} hasn't been seen on camera for ${Math.floor((now - seen) / 60_000)} min. They may have left; camera coverage is not proof. Confirm they left before choosing Yes.`, visitId: visit.id, action: 'left', createdAt: now });
      if (now - visit.createdAt >= 30 * 60_000) this.propose(`back:${visit.id}`, { kind: 'check_back', text: `${visit.name} has waited ${minutes} min. Send a hallway check-back: “Still doing okay? Tell the front desk if you feel worse.”`, visitId: visit.id, action: 'hallway', createdAt: now });
    }
    return { suggestions: this.entries.filter(e => e.status === 'pending').map(({ key: _key, status: _status, acceptedAt: _acceptedAt, ...suggestion }) => suggestion), dispositions: { ...this.dispositions } };
  }
  noteChecked(id: string, _now = Date.now()) { this.sync(); this.checked.add(id); }
  patientDone(room: string, visitId: string, now = Date.now()): CommandResult {
    this.sync(); const visit = this.store.state.visits.find(v => v.id === visitId && v.status === 'called' && v.room && roomKey(v.room) === roomKey(room));
    if (!visit) return { ok: false, message: 'That patient is no longer in this room. Refresh before marking Patient done.' };
    this.finish(visit, 'done', now); this.rooms.set(roomKey(room), now);
    return { ok: true, message: `${visit.name} marked done. ${roomLabel(roomKey(room))} is free.` };
  }
  private finish(visit: Visit, status: Disposition['status'], now: number) {
    this.dispositions[visit.id] = { status, at: now, name: visit.name, queueNo: visit.queueNo, room: visit.room };
    // Frozen Visit contract: no longer waiting, and no exam-room assignment. The local disposition is authoritative.
    visit.status = 'called'; visit.room = null;
    if (this.store.state.nowCalling?.visitId === visit.id) this.store.state.nowCalling = null;
    this.store.changed();
  }
  async accept(id?: string, now = Date.now()): Promise<CommandResult> {
    this.list(now);
    const entry = id ? this.entries.find(e => e.id === id && e.status === 'pending') : this.entries.findLast(e => e.status === 'pending');
    if (!entry) return { ok: false, message: 'That suggestion is no longer available. Please review the current cards.' };
    if (!this.valid(entry, now)) return { ok: false, message: 'The room has changed. Please review the current cards.' };
    const visit = this.store.state.visits.find(v => v.id === entry.visitId);
    let result: CommandResult = { ok: true, message: entry.kind === 'long_wait' ? `Reminder acknowledged for ${visit!.name}; a human check is still needed.` : entry.kind === 'check_back' ? `Hallway check-back posted for number ${visit!.queueNo}.` : 'Suggestion noted.' };
    if (entry.action === 'call') result = this.actions.call(visit!, entry.room!);
    if (!result.ok) return result;
    entry.status = 'accepted'; entry.acceptedAt = now;
    if (entry.action === 'left') { this.finish(visit!, 'left', now); result = { ok: true, message: `${visit!.name} marked left after staff confirmation. Record retained.` }; }
    return result;
  }
  dismiss(id: string, now = Date.now()): CommandResult {
    this.list(now); const entry = this.entries.find(e => e.id === id && e.status === 'pending');
    if (!entry) return { ok: false, message: 'That suggestion is no longer available.' };
    entry.status = 'dismissed'; return { ok: true, message: 'Not now. Suggestion dismissed.' };
  }
  hallway(now = Date.now()): { id: string; text: string }[] {
    this.sync();
    return this.entries.filter(e => e.kind === 'check_back' && e.status === 'accepted' && now - (e.acceptedAt ?? e.createdAt) < 10 * 60_000 && this.valid(e, now))
      .map(entry => { const visit = this.store.state.visits.find(v => v.id === entry.visitId)!; return { id: entry.id, text: `#${visit.queueNo} · ${visit.name.trim().charAt(0).toUpperCase()}. Still doing okay? Tell the front desk if you feel worse.` }; });
  }
  async shiftSummary(generate: () => Promise<{ answer: string; source: 'template' | 'gemini' }>, now = Date.now()): Promise<CommandResult> {
    this.sync(); const state = this.store.state;
    const summary = await generate();
    if (this.store.state !== state) return { ok: false, message: 'Room reset while preparing the summary. Please ask again.' };
    const key = `shift:${randomUUID()}`;
    this.propose(key, { kind: 'shift_summary', text: summary.answer, source: summary.source, createdAt: now });
    return { ok: true, message: summary.answer, data: { ...summary, suggestionId: this.entries.find(entry => entry.key === key)!.id } };
  }
}
