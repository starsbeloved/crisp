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
  { name: 'Ama', dateOfBirth: '1994-06-15', allergies: ['Penicillin, recorded 2023 (demo record)'], medications: ['Cetirizine 10 mg daily, recorded 2025'], problems: ['Seasonal allergies, recorded 2023'], pastVisits: [{ date: '2025-04-12', note: 'Annual visit; medication list recorded.' }, { date: '2023-08-09', note: 'Penicillin allergy recorded.' }], lastVitals: { date: '2025-04-12', heartRate: 76, respiratoryRate: 16, bloodPressure: '118/76' } },
  { name: 'Ben', dateOfBirth: '1988-11-02', allergies: [], medications: [], problems: [], pastVisits: [{ date: '2025-09-20', note: 'Routine visit; no medications recorded.' }], lastVitals: { date: '2025-09-20', heartRate: 72, respiratoryRate: 15, bloodPressure: '122/78' } },
  { name: 'Cara', dateOfBirth: '1975-03-21', allergies: ['Latex, recorded 2022 (demo record)'], medications: ['Lisinopril 5 mg daily, recorded 2024'], problems: ['Hypertension, recorded 2024'], pastVisits: [{ date: '2025-07-08', note: 'Medication list updated.' }], lastVitals: { date: '2025-07-08', heartRate: 80, respiratoryRate: 17, bloodPressure: '128/82' } },
  { name: 'Dev', dateOfBirth: '2001-09-10', allergies: ['Peanuts, recorded 2020 (demo record)'], medications: [], problems: ['Eczema, recorded 2021'], pastVisits: [{ date: '2025-02-18', note: 'Skin follow-up visit recorded.' }], lastVitals: { date: '2025-02-18', heartRate: 68, respiratoryRate: 14, bloodPressure: '114/72' } },
  { name: 'Elena', dateOfBirth: '1962-12-04', allergies: [], medications: ['Levothyroxine 50 mcg daily, recorded 2023'], problems: ['Hypothyroidism, recorded 2023'], pastVisits: [{ date: '2025-10-01', note: 'Routine follow-up; medication list recorded.' }], lastVitals: { date: '2025-10-01', heartRate: 74, respiratoryRate: 16, bloodPressure: '124/80' } },
];
const normalizedName = (name: string) => name.trim().toLowerCase();
const roomNumber = (room: string) => room.trim().replace(/^room\s*/i, '').toLowerCase();
export function findDemoRecord(name: string, dateOfBirth: string | null | undefined): DemoRecord | null {
  if (!dateOfBirth) return null;
  return DEMO_RECORDS.find(record => normalizedName(record.name) === normalizedName(name) && record.dateOfBirth === dateOfBirth) ?? null;
}
export interface RecordResult { label: typeof RECORDS_LABEL; visitId: string | null; record: DemoRecord | null; allergyText: string | null; message: string }
export function recordForVisit(visit: Visit): RecordResult {
  const record = findDemoRecord(visit.name, visit.answers.dateOfBirth);
  return { label: RECORDS_LABEL, visitId: visit.id, record, allergyText: record ? record.allergies.join('; ') || 'None recorded' : null, message: record ? 'Record retrieved by exact name and date of birth' : 'No prior record found' };
}
/** Doctor/nurse client tool: retrieve recorded data only; never fuzzy-match a history. */
export function getRecord(visits: Visit[], input: { name: string; room?: string; visitId?: string }): RecordResult {
  const matches = visits.filter(visit => normalizedName(visit.name) === normalizedName(input.name) &&
    (!input.room || (visit.status === 'called' && visit.room && roomNumber(visit.room) === roomNumber(input.room))) &&
    (!input.visitId || visit.id === input.visitId));
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
    const entries: GalleryEntry[] = store.state.visits.filter(visit => visit.status === 'called' && visit.room && roomNumber(visit.room) === roomNumber(room))
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
