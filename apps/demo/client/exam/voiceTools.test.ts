import { describe, expect, it, vi } from 'vitest';
import type { RoomState } from '../../shared/types.ts';
import { createExamVoiceTools } from './voiceTools.ts';
import { DEMO_RECORDS, RECORDS_LABEL } from '../../server/records.ts';
const state: RoomState = { serverNow: Date.now(), visits: [{ id: 'ama', name: 'Ama', status: 'called', room: '1', calledAt: Date.now(), createdAt: Date.now(), queueNo: 1, faceEnrolled: false, summary: null, answers: { reason: 'Patient words', dateOfBirth: '1994-06-15', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form' } }], vitals: {}, alerts: [], handoffs: {}, cameras: {}, references: [], nowCalling: null, providers: { agent: false, gemini: false, elevenlabs: false } };
describe('doctor client tools for the existing nurse agent', () => {
  it('provides the nurse digest and exact record retrieval with a verbatim-only instruction', async () => {
    const retrieve = vi.fn(async () => ({ record: DEMO_RECORDS[0], allergyText: 'Penicillin', visitId: 'ama', label: RECORDS_LABEL, message: 'Retrieved' }));
    const tools = createExamVoiceTools(() => state, () => '1', retrieve);
    expect(JSON.parse(tools.get_room_digest()).visits[0].name).toBe('Ama');
    const result = JSON.parse(await tools.get_record({ name: 'Ama' }));
    expect(retrieve).toHaveBeenCalledWith({ name: 'Ama', visitId: 'ama', room: '1' });
    expect(result.readBack).toBe('Penicillin');
    expect(result.instruction).toContain('verbatim');
  });
  it('does not retrieve when offline, outside this room, or with an ambiguous name', async () => {
    const retrieve = vi.fn();
    for (const s of [null, { ...state, visits: [...state.visits, { ...state.visits[0], id: 'other' }] }, { ...state, visits: [{ ...state.visits[0], room: '2' }] }]) {
      const tools = createExamVoiceTools(() => s, () => '1', retrieve);
      expect(JSON.parse(await tools.get_record({ name: 'Ama' })).error).toBeTruthy();
    }
    expect(retrieve).not.toHaveBeenCalled();
  });
});
