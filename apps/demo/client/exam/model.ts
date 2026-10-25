import type { GalleryEntry, Quality, Visit } from '../../shared/types.ts';
import type { DetectedFace } from '../lib/face.ts';

export const RECORDS_LABEL = 'Demo records — fictional';
export const normalizeRoom = (room: string) => room.trim().replace(/^room\s*/i, '').toLowerCase();
export function examVisits(visits: Visit[], room: string): Visit[] {
  return visits.filter(visit => visit.status === 'called' && visit.room && normalizeRoom(visit.room) === normalizeRoom(room))
    .sort((a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0));
}
export function resolveExamName(visits: Visit[], name: string): Visit | null {
  const matches = visits.filter(visit => visit.name.trim().toLowerCase() === name.trim().toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}
export function ageFromDob(dob: string | null | undefined, now = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birthday = new Date(`${dob}T00:00:00Z`);
  if (!Number.isFinite(birthday.getTime()) || birthday.toISOString().slice(0, 10) !== dob) return null;
  const [year, month, day] = dob.split('-').map(Number);
  const age = now.getFullYear() - year - (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day) ? 1 : 0);
  return age >= 0 ? age : null;
}
export function cameraEstimate(value: number | null | undefined, quality: Quality | undefined, stale: boolean, unit: string): string {
  if (stale) return 'Not current';
  if (quality === 'low') return 'Low signal';
  return value != null && Number.isFinite(value) && (quality === 'good' || quality === 'fair') ? `${value} ${unit}` : 'Not measured';
}
/** One clear face, a strict distance threshold, and separation from other identities. */
export function recognizeArrival(faces: DetectedFace[], gallery: GalleryEntry[], visits: Visit[], room: string): string | null {
  if (faces.length !== 1 || faces[0].score < 0.8 || faces[0].box.w < 80) return null;
  const eligible = new Set(examVisits(visits, room).map(visit => visit.id));
  const distances = new Map<string, number>();
  for (const entry of gallery) {
    const descriptor = faces[0].descriptor;
    if (!eligible.has(entry.visitId) || !descriptor.length || descriptor.length !== entry.descriptor.length || !descriptor.every(Number.isFinite) || !entry.descriptor.every(Number.isFinite)) continue;
    const distance = Math.sqrt(descriptor.reduce((sum, value, i) => sum + (value - entry.descriptor[i]) ** 2, 0));
    distances.set(entry.visitId, Math.min(distances.get(entry.visitId) ?? Infinity, distance));
  }
  const ranked = [...distances.entries()].sort((a, b) => a[1] - b[1]);
  if (!ranked.length || ranked[0][1] >= 0.45 || (ranked[1] && ranked[1][1] - ranked[0][1] < 0.08)) return null;
  return ranked[0][0];
}
export type ExamCommand = { kind: 'chart'; name: string } | { kind: 'allergies' | 'unsupported' };
export function parseExamCommand(text: string): ExamCommand | null {
  const wake = text.trim().match(/^hey[\s,]+(?:crisp|chris|crispy)\b[\s,.:;!?-]*(.*)$/i);
  if (!wake) return null;
  const command = wake[1].replace(/[.!?]+$/, '').trim();
  const chart = command.match(/^(?:please\s+)?pull up (.+?)(?:['’]s)? chart$/i);
  if (chart) return { kind: 'chart', name: chart[1].trim() };
  if (/^(?:any allergies|what (?:are|about) (?:the |their |recorded )?allergies|read (?:the )?allergies)$/i.test(command)) return { kind: 'allergies' };
  return { kind: 'unsupported' };
}
