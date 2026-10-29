import { normalizeRoom } from '../client/staff/rooms.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GalleryEntry, Visit } from '../shared/types.ts';
import type { RoomStore } from './store.ts';

export const RECORDS_LABEL = 'Demo records — fictional' as const;
export interface DemoRecord {
  name: string; dateOfBirth: string; allergies: string[]; medications: string[]; problems: string[];
  pastVisits: { date: string; note: string }[];
  lastVitals: { date: string; heartRate: number; respiratoryRate: number; bloodPressure: string };
}
// Invented examples for the film. These never replace today's patient-entered answers.
export const DEMO_RECORDS: readonly DemoRecord[] = [
  { name: 'Jason Miller', dateOfBirth: '1990-03-12', allergies: ['Penicillin'], medications: ['Cetirizine 10 mg daily'], problems: ['Seasonal allergies'], pastVisits: [{ date: '2025-04-12', note: 'Annual visit; medication list recorded.' }, { date: '2023-08-09', note: 'Penicillin allergy recorded.' }], lastVitals: { date: '2025-04-12', heartRate: 76, respiratoryRate: 16, bloodPressure: '118/76' } },
  { name: 'Daniel Kim', dateOfBirth: '1985-11-02', allergies: ['Latex'], medications: ['Lisinopril 5 mg daily'], problems: ['Hypertension'], pastVisits: [{ date: '2025-07-08', note: 'Medication list reviewed.' }, { date: '2024-06-18', note: 'Latex allergy recorded.' }], lastVitals: { date: '2025-07-08', heartRate: 80, respiratoryRate: 17, bloodPressure: '128/82' } },
  { name: 'Anna Lopez', dateOfBirth: '1997-07-21', allergies: ['Penicillin'], medications: ['Cetirizine 10 mg as needed'], problems: ['Seasonal allergies'], pastVisits: [{ date: '2025-09-20', note: 'Routine visit; allergy history reviewed.' }, { date: '2024-03-14', note: 'Penicillin allergy and medication list recorded.' }], lastVitals: { date: '2025-09-20', heartRate: 72, respiratoryRate: 15, bloodPressure: '112/74' } },
];
const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const firstName = (name: string) => normalizedName(name).split(' ')[0];
export function findDemoRecord(name: string, dateOfBirth: string | null | undefined): DemoRecord | null {
  const needle = normalizedName(name);
  const matches = DEMO_RECORDS.filter(record => normalizedName(record.name) === needle || firstName(record.name) === needle);
  // A supplied DOB must match. Never fall back from a mismatched birthday.
  const eligible = dateOfBirth ? matches.filter(record => record.dateOfBirth === dateOfBirth) : matches;
  return eligible.length === 1 ? eligible[0] : null;
}
export interface RecordResult { label: typeof RECORDS_LABEL; visitId: string | null; record: DemoRecord | null; allergyText: string | null; message: string }
export function recordForVisit(visit: Visit): RecordResult {
  const record = findDemoRecord(visit.name, visit.answers.dateOfBirth);
  return { label: RECORDS_LABEL, visitId: visit.id, record, allergyText: record ? record.allergies.join('; ') || 'None recorded' : null,
    message: record ? (visit.answers.dateOfBirth ? 'Matched by first name + date of birth' : 'matched by name only') : `I don't have earlier records for ${visit.name.trim().split(/\s+/)[0]} in this demo system.` };
}
export function recordReadBack(name: string, result: RecordResult): string {
  if (!result.record) return result.message;
  const allergies = result.record.allergies;
  return `From ${name.trim().split(/\s+/)[0]}'s demo record: ${allergies.length ? `allergic to ${allergies.join('; ').toLowerCase()}` : 'no allergies recorded'}.`;
}
/** Resolve today's visit uniquely before retrieving a fictional history. */
export function getRecord(visits: Visit[], input: { name: string; room?: string; visitId?: string }): RecordResult {
  const eligible = visits.filter(visit =>
    (!input.room || (visit.status === 'called' && visit.room && normalizeRoom(visit.room) === normalizeRoom(input.room))) &&
    (!input.visitId || visit.id === input.visitId));
  const exact = eligible.filter(visit => normalizedName(visit.name) === normalizedName(input.name));
  const matches = exact.length ? exact : eligible.filter(visit => firstName(visit.name) === normalizedName(input.name));
  if (matches.length !== 1) return { label: RECORDS_LABEL, visitId: null, record: null, allergyText: null, message: matches.length ? 'Patient name is ambiguous; select the visit on screen' : 'No patient found' };
  return recordForVisit(matches[0]);
}

export async function handleExamRequest(request: IncomingMessage, response: ServerResponse, url: URL, store: RoomStore): Promise<boolean> {
  const send = (status: number, data: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); return true; };
  if (request.method === 'GET' && url.pathname === '/api/records') {
    const visit = store.state.visits.find(item => item.id === url.searchParams.get('visitId'));
    return visit ? send(200, recordForVisit(visit)) : send(404, { error: 'Visit not found', label: RECORDS_LABEL });
  }
  if (request.method === 'GET' && url.pathname === '/api/exam/gallery') {
    const room = url.searchParams.get('room');
    if (!room?.trim()) return send(400, { error: 'Room is required' });
    const entries: GalleryEntry[] = store.state.visits.filter(visit => visit.status === 'called' && visit.room && normalizeRoom(visit.room) === normalizeRoom(room))
      .flatMap(visit => (store.descriptors[visit.id] ?? []).map(descriptor => ({ visitId: visit.id, name: visit.name, descriptor })));
    return send(200, entries);
  }
  if (request.method === 'POST' && url.pathname === '/api/records/get_record') {
    let body = ''; let tooLarge = false;
    for await (const chunk of request) { if (body.length + chunk.length > 8000) tooLarge = true; if (!tooLarge) body += chunk.toString(); }
    if (tooLarge) return send(413, { error: 'Body too large' });
    let input: unknown;
    try { input = JSON.parse(body); } catch { return send(400, { error: 'Invalid JSON' }); }
    if (!input || typeof input !== 'object' || !('name' in input) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 ||
      ('room' in input && typeof input.room !== 'string') || ('visitId' in input && typeof input.visitId !== 'string')) return send(400, { error: 'Expected name and optional room/visitId' });
    return send(200, getRecord(store.state.visits, input as { name: string; room?: string; visitId?: string }));
  }
  return false;
}
