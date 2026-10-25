import type { Alert, Quality, RoomState, Vitals } from '../../shared/types.ts';

export function activeAlert(state: RoomState, visitId: string): Alert | undefined {
  return state.alerts.filter(a => a.visitId === visitId && a.status !== 'checked')
    .sort((a, b) => Number(b.level === 'red') - Number(a.level === 'red') || b.openedAt - a.openedAt)[0];
}
export function waitingQueue(state: RoomState) {
  const rank = (id: string) => { const a = activeAlert(state, id); return a ? a.level === 'red' ? 2 : 1 : 0; };
  return state.visits.filter(v => v.status === 'waiting').sort((a, b) => rank(b.id) - rank(a.id) || a.queueNo - b.queueNo);
}
export function estimate(value: number | null | undefined, quality: Quality | undefined, stale = false) {
  if (stale) return 'measuring…';
  if (quality === 'low') return 'low signal';
  return value != null && Number.isFinite(value) && (quality === 'good' || quality === 'fair') ? String(Math.round(value)) : 'measuring…';
}
export function postureLabel(vitals?: Vitals) {
  const p = vitals?.posture;
  if (!p) return 'Posture measuring…';
  if (p.fallSuspected) return 'Fall-like motion';
  if (p.headDropSec >= 1) return `Head lowered ${Math.floor(p.headDropSec)} s`;
  if (p.slumpSec >= 1) return `Slumped ${Math.floor(p.slumpSec)} s`;
  if (p.stillSec >= 30) return `Still ${Math.floor(p.stillSec)} s`;
  return 'Upright';
}
export function sourceLabel(source: string) { return source === 'gemini' ? '✦ Gemini' : 'Template'; }
export function firstName(name: string) { return name.trim().split(/\s+/)[0] || 'Guest'; }
export function referenceMae(state: RoomState, visitId: string) {
  const pairs = state.references.filter(s => s.visitId === visitId && s.cameraBpm != null && Number.isFinite(s.cameraBpm));
  return pairs.length ? pairs.reduce((sum, s) => sum + Math.abs(s.referenceBpm - s.cameraBpm!), 0) / pairs.length : null;
}
