import { expect, it, vi } from 'vitest';
import { createStaffTools } from './tools.ts';
it('registers deterministic staff tools and shows every tool response as confirmation', async () => {
  const call = vi.fn(async () => ({ ok: true, message: 'Calling Ama to Room 1.', data: { visitId: 'ama' } }));
  const notify = vi.fn(); const record = vi.fn();
  const tools = createStaffTools({ connected: () => true, digest: () => 'recorded context', notify, request: call, onRecord: record });
  for (const name of ['list_waiting', 'patient_summary', 'call_patient', 'acknowledge_request', 'mark_checked', 'get_record', 'accept_suggestion', 'shift_summary']) expect(tools[name]).toBeTypeOf('function');
  expect(JSON.parse(await tools.call_patient({ name: 'Ama', room: '1' })).message).toBe('Calling Ama to Room 1.');
  expect(call).toHaveBeenCalledWith('call_patient', { name: 'Ama', room: '1' }); expect(notify).toHaveBeenCalled();
  await tools.get_record({ name: 'Ama' }); expect(record).toHaveBeenCalledWith({ visitId: 'ama' });
});
it('never sends a disconnected command and returns provider-safe failure on network errors', async () => {
  const call = vi.fn(async () => { throw new Error('offline'); });
  let connected = false;
  const tools = createStaffTools({ connected: () => connected, digest: () => '', notify: vi.fn(), request: call });
  expect(JSON.parse(await tools.mark_checked({ name: 'Ama' })).ok).toBe(false); expect(call).not.toHaveBeenCalled();
  connected = true; expect(JSON.parse(await tools.mark_checked({ name: 'Ama' })).message).toContain('unavailable');
});
