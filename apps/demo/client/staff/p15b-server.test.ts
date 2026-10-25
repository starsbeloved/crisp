import { afterEach, beforeEach, expect, it } from 'vitest';
import { createAppServer } from '../../server/http.ts';
import type { Visit } from '../../shared/types.ts';

let app: ReturnType<typeof createAppServer>, base: string;
const visit = (id: string, name = id): Visit => ({ id, name, queueNo: Number(id) || 1, createdAt: Date.now(), status: 'waiting', room: null, calledAt: null, faceEnrolled: false, summary: null,
  answers: { reason: 'Fictional browser fixture', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form', dateOfBirth: '1994-06-15' } });
beforeEach(async () => {
  app = createAppServer({ dataDir: null, readProviders: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
afterEach(async () => { app.server.closeAllConnections(); await new Promise<void>(resolve => app.server.close(() => resolve())); });
async function post(path: string, body: unknown = {}) { return (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
async function get(path: string) { return (await fetch(base + path)).json(); }

it('removes a selected visit from the queue, retains its record and records staff confirmation', async () => {
  app.store.state.visits = [{ ...visit('1', 'Anna'), answers: { ...visit('1').answers, dateOfBirth: '1997-07-21' } }, visit('2', 'Ben')];
  const result = await post('/api/visits/1/remove');
  expect(result.ok).toBe(true);
  expect((await post('/api/commands/list_waiting')).data.waiting.map((v: Visit) => v.name)).toEqual(['Ben']);
  expect((await post('/api/commands/get_record', { name: 'Anna' })).data.record.name).toBe('Anna Lopez');
  expect((await get('/api/suggestions')).dispositions['1'].status).toBe('left');
  expect((await post('/api/visits/1/remove')).ok).toBe(false);
  expect((await post('/api/visits/missing/remove')).ok).toBe(false);
});
it('voice removal uses the same exact and unique-prefix rules and refuses ambiguous names', async () => {
  app.store.state.visits = [visit('1', 'Ama'), visit('2', 'Amanda')];
  expect((await post('/api/commands/remove_patient', { name: 'am' })).choices).toHaveLength(2);
  expect(app.store.state.visits.every(v => v.status === 'waiting')).toBe(true);
  expect((await post('/api/commands/remove_patient', { name: ' AMA ' })).ok).toBe(true);
  expect((await post('/api/commands/remove_patient', { name: 'aman' })).ok).toBe(true);
  expect((await post('/api/commands/remove_patient', { name: 'Ama' })).ok).toBe(false);
});
it('posts a deduplicated kiosk help suggestion for Command Center', async () => {
  expect((await post('/api/checkin/help')).ok).toBe(true);
  await post('/api/checkin/help');
  const cards = (await get('/api/suggestions')).suggestions;
  expect(cards.filter((c: { kind: string }) => c.kind === 'kiosk_help')).toHaveLength(1);
  expect(cards[0].text).toBe('Someone asked for help at the check-in kiosk');
});
it('reset returns within one second and clears room state, side stores, dispositions and stations', async () => {
  app.store.state.visits = [visit('1', 'Ama'), visit('2', 'Ben')];
  await post('/api/stations', { id: 'stale', name: 'Old screen', role: 'lobby' });
  await post('/api/commands/call_patient', { name: 'Ama', room: '1' });
  await post('/api/exam/patient-done', { room: '1', visitId: '1' });
  await post('/api/checkin/help');
  app.store.state.handoffs['1'] = { visitId: '1', text: 'Fictional handoff', source: 'template', createdAt: Date.now() };
  app.store.descriptors['1'] = [[1, 2]];
  const started = performance.now();
  expect(await post('/api/demo/reset')).toMatchObject({ ok: true, message: 'Reset done' });
  expect(performance.now() - started).toBeLessThan(1000);
  expect(app.store.state).toMatchObject({ visits: [], alerts: [], vitals: {}, cameras: {}, nowCalling: null, handoffs: {}, references: [] });
  expect(app.store.descriptors).toEqual({});
  expect(await get('/api/suggestions')).toEqual({ suggestions: [], dispositions: {} });
  expect(await get('/api/hallway/check-back')).toEqual({ messages: [] });
  expect(await get('/api/stations')).toEqual({ stations: [] });
});
