import { describe, expect, it, vi } from 'vitest';
import { matchPatient, StaffCommands } from './commands.ts';
import { RoomStore } from './store.ts';
import type { Visit } from '../shared/types.ts';
const visit = (id: string, name = id): Visit => ({ id, name, queueNo: 1, createdAt: 0, status: 'waiting', calledAt: null, room: null, faceEnrolled: false, summary: null,
  answers: { reason: 'Patient words', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form', dateOfBirth: '1994-06-15' } });
function setup(visits = [visit('Ama'), visit('Ben')]) {
  const store = new RoomStore(); store.state.visits = visits;
  const onCall = vi.fn(async () => {});
  return { store, onCall, commands: new StaffCommands(store, { onCall }) };
}
describe('staff name matching', () => {
  it('prefers exact, ignores case/whitespace, then permits a unique prefix', () => {
    const visits = [visit('1', 'Ama'), visit('2', 'Amanda'), visit('3', 'Ben Cooper')];
    expect(matchPatient(visits, ' AMA ').visit?.id).toBe('1');
    expect(matchPatient(visits, 'ben c').visit?.id).toBe('3');
    expect(matchPatient(visits, 'am').choices).toHaveLength(2);
    expect(matchPatient(visits, 'cooper').visit).toBeUndefined();
    expect(matchPatient(visits, '').visit).toBeUndefined();
  });
  it('never chooses between duplicate exact names', () => {
    expect(matchPatient([visit('1', 'Ama'), visit('2', 'Ama')], 'Ama').choices).toHaveLength(2);
  });
});
describe('deterministic staff commands', () => {
  it('lists waiting, returns recorded summary and fictional history without falling back from a wrong DOB', async () => {
    const anna = visit('Anna'); anna.answers.dateOfBirth = '1997-07-21';
    const daniel = visit('Daniel'); daniel.answers.dateOfBirth = '1985-11-02';
    const { commands } = setup([anna, daniel]);
    expect((await commands.run('list_waiting', {})).data).toMatchObject({ waiting: [{ name: 'Anna' }, { name: 'Daniel' }] });
    expect((await commands.run('patient_summary', { name: 'an' })).data).toMatchObject({ answers: { reason: 'Patient words' } });
    expect(await commands.run('get_record', { name: 'an' })).toMatchObject({ ok: true, message: "From Anna's demo record: allergic to penicillin.", data: { label: 'Demo records — fictional', record: { name: 'Anna Lopez', allergies: ['Penicillin'] }, message: 'Matched by first name + date of birth' } });
    anna.answers.dateOfBirth = null;
    expect((await commands.run('get_record', { name: 'Anna' })).data).toMatchObject({ record: { name: 'Anna Lopez' }, message: 'matched by name only' });
    anna.answers.dateOfBirth = '1997-07-22';
    expect(await commands.run('get_record', { name: 'Anna' })).toMatchObject({ message: "I don't have earlier records for Anna in this demo system.", data: { record: null, allergyText: null } });
    const ambiguous = setup([anna, visit('other', 'Anna')]);
    const result = await ambiguous.commands.run('get_record', { name: 'Anna' });
    expect(result.ok).toBe(false); expect(result.data).toBeUndefined(); expect(result.choices).toHaveLength(2);
  });
  it('does not mutate on ambiguous names, malformed room or unknown tool', async () => {
    const { commands, store, onCall } = setup([visit('1', 'Ama'), visit('2', 'Amanda')]);
    expect((await commands.run('call_patient', { name: 'am', room: '1' })).ok).toBe(false);
    expect((await commands.run('call_patient', { name: 'Ama', room: '' })).ok).toBe(false);
    expect((await commands.run('call_patient', { name: 'Ama', room: 1 })).ok).toBe(false);
    expect((await commands.run('invent', {})).ok).toBe(false);
    expect(store.state.visits.every(v => v.status === 'waiting')).toBe(true); expect(onCall).not.toHaveBeenCalled();
  });
  it('calls once, publishes lobby call and invokes the existing handoff/audio orchestration', async () => {
    const { commands, store, onCall } = setup();
    expect((await commands.run('call_patient', { name: 'Ama', room: 'Room 1' })).message).toBe('Calling Ama to Room 1.');
    expect(store.state.visits[0]).toMatchObject({ status: 'called', room: '1' });
    expect(store.state.nowCalling).toMatchObject({ name: 'Ama', room: '1', audio: 'pending' });
    expect(onCall).toHaveBeenCalledTimes(1);
    expect((await commands.run('call_patient', { name: 'Ama', room: '2' })).ok).toBe(false);
  });
  it('refuses an occupied room', async () => {
    const { commands, store } = setup();
    Object.assign(store.state.visits[1], { status: 'called', room: '1' });
    expect((await commands.run('call_patient', { name: 'Ama', room: 'room 1' })).ok).toBe(false);
    expect(store.state.visits[0].status).toBe('waiting');
  });
  it('acknowledges and checks the same alert as buttons, resetting baseline', async () => {
    const { demoFixture } = await import('../client/dashboard/fixture.ts');
    const { commands, store } = setup(); store.state = demoFixture();
    expect((await commands.run('acknowledge_request', { name: 'Ama' })).ok).toBe(true);
    expect(store.state.alerts[0].status).toBe('acknowledged');
    expect((await commands.run('mark_checked', { name: 'Ama' })).ok).toBe(true);
    expect(store.state.alerts[0].status).toBe('checked');
    expect(store.state.vitals['synthetic-ama'].baselineHr).toBe(null);
  });
});

describe('appended staff HTTP routes', () => {
  it('serves suggestions, validates actions, and retains records after Patient done', async () => {
    const { createAppServer } = await import('./http.ts');
    const app = createAppServer({ dataDir: null, readProviders: false });
    app.store.state.visits = [visit('Ama'), visit('Ben')];
    const address = await new Promise<number>(resolve => { app.server.listen(0, '127.0.0.1', () => resolve((app.server.address() as { port: number }).port)); });
    const url = `http://127.0.0.1:${address}`;
    const post = async (path: string, body: unknown) => (await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    try {
      expect((await post('/api/commands/call_patient', { name: 'Ama', room: '1' })).ok).toBe(true);
      expect((await post('/api/exam/patient-done', { room: '1', visitId: 'Ama' })).ok).toBe(true);
      const snapshot = await (await fetch(url + '/api/suggestions')).json();
      expect(snapshot.dispositions.Ama.status).toBe('done');
      const card = snapshot.suggestions.find((s: { kind: string }) => s.kind === 'room_free');
      expect((await post('/api/commands/accept_suggestion', { id: card.id })).ok).toBe(true);
      expect(app.store.state.visits[1]).toMatchObject({ status: 'called', room: '1' });
      expect((await post('/api/commands/get_record', { name: 'Ama' })).data.label).toBe('Demo records — fictional');
      expect((await fetch(url + '/api/hallway/check-back')).status).toBe(200);
    } finally { app.server.closeAllConnections(); await new Promise<void>(resolve => app.server.close(() => resolve())); }
  });
});

it('loads staff modules in the same native Node TypeScript runtime as the server', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'await import("./server/commands.ts"); await import("./server/proactive.ts");'], { cwd: process.cwd(), encoding: 'utf8' });
  expect(result.stderr).toBe(''); expect(result.status).toBe(0);
});
