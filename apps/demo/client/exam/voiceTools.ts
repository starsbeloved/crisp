import type { RecordResult } from '../../server/records.ts';
import type { RoomState } from '../../shared/types.ts';
import { roomDigest } from '../dashboard/AskCrispVoice.tsx';
import { examVisits, resolveExamName } from './model.ts';

type Retrieval = (input: { name: string; visitId: string; room: string }) => Promise<Pick<RecordResult, 'record' | 'allergyText' | 'visitId' | 'label' | 'message'>>;
export async function retrieveRecord(input: { name: string; visitId: string; room: string }): Promise<RecordResult> {
  const response = await fetch('/api/records/get_record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error('Record unavailable');
  return response.json();
}
/** P13a can reuse these tools when extending the nurse agent. */
export function createExamVoiceTools(currentState: () => RoomState | null, currentRoom: () => string, retrieve: Retrieval = retrieveRecord) {
  return {
    get_room_digest: () => roomDigest(currentState()),
    async get_record(parameters: unknown): Promise<string> {
      const state = currentState();
      if (!state) return JSON.stringify({ error: 'Room information is disconnected' });
      const name = parameters && typeof parameters === 'object' && 'name' in parameters && typeof parameters.name === 'string' ? parameters.name : '';
      const room = currentRoom();
      const visit = resolveExamName(examVisits(state.visits, room), name);
      if (!visit) return JSON.stringify({ error: 'No unique exact name in this room; ask staff to select the visit' });
      try {
        const result = await retrieve({ name: visit.name, visitId: visit.id, room });
        const latest = currentState();
        if (!latest || currentRoom() !== room || !examVisits(latest.visits, room).some(item => item.id === visit.id)) return JSON.stringify({ error: 'Visit is no longer available in this room' });
        return JSON.stringify({ ...result, readBack: result.allergyText, instruction: 'Read recorded allergy text verbatim, or say None recorded only for an empty recorded list. Label this demo record fictional. Retrieve only; do not interpret, diagnose, or recommend.' });
      } catch { return JSON.stringify({ error: 'Record unavailable; review the on-screen chart' }); }
    },
  };
}
