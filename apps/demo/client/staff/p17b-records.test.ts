import { expect, it } from 'vitest';
import type { Visit } from '../../shared/types.ts';
import { DEMO_RECORDS, findDemoRecord, getRecord, recordForVisit } from '../../server/records.ts';
import { StaffCommands } from '../../server/commands.ts';
import { ProactiveAgent } from '../../server/proactive.ts';
import { RoomStore } from '../../server/store.ts';
const visit = (name = 'Anna', dateOfBirth: string | null = '1997-07-21'): Visit => ({ id: name, name, queueNo: 1, createdAt: 1000, status: 'waiting', calledAt: null, room: null, faceEnrolled: false, summary: null, answers: { reason: 'Fictional headache', dateOfBirth, reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form' } });
it('contains exactly the three filming records, each with two prior visits and complete lists', () => {
  expect(DEMO_RECORDS.map(r => [r.name, r.dateOfBirth])).toEqual([
    ['Jason Miller', '1990-03-12'], ['Daniel Kim', '1985-11-02'], ['Anna Lopez', '1997-07-21'],
  ]);
  for (const r of DEMO_RECORDS) {
    expect(r.pastVisits).toHaveLength(2);
    for (const field of [r.allergies, r.medications, r.problems]) expect(field.length).toBeGreaterThan(0);
  }
});
it('matches first name plus DOB, and allows unique name only solely when DOB was omitted', () => {
  expect(findDemoRecord(' anna ', '1997-07-21')?.name).toBe('Anna Lopez');
  expect(findDemoRecord('Anna Lopez', '1997-07-21')?.name).toBe('Anna Lopez');
  expect(recordForVisit(visit('Anna', null)).message).toContain('matched by name only');
  expect(recordForVisit(visit('Anna', null)).record?.name).toBe('Anna Lopez');
  for (const [name, dob] of [['Anna', '1997-07-20'], ['Ann', null], ['Anna Jones', '1997-07-21'], ['Ama', null]]) expect(findDemoRecord(name!, dob)).toBeNull();
  expect(recordForVisit(visit('Anna', '1997-07-20')).message).toBe("I don't have earlier records for Anna in this demo system.");
  expect(getRecord([visit(), { ...visit(), id: 'duplicate' }], { name: 'Anna' }).record).toBeNull();
});
it('normalizes room one across call, occupancy, record lookup and patient done', async () => {
  const store = new RoomStore(null); store.state.visits = [visit(), visit('Jason', '1990-03-12')];
  const commands = new StaffCommands(store, { onCall: async () => {} });
  expect((await commands.run('call_patient', { name: 'Anna', room: 'room one' })).ok).toBe(true);
  expect(store.state.visits[0].room).toBe('1');
  expect(getRecord(store.state.visits, { name: 'Anna', room: 'Room 1' }).record?.name).toBe('Anna Lopez');
  expect(commands.call(store.state.visits[1], 'Room one').ok).toBe(false);
  const proactive = new ProactiveAgent(store, { call: (v, room) => commands.call(v, room) });
  expect(proactive.patientDone('room one', 'Anna').ok).toBe(true);
});
it('speaks the natural demo-record wording without the old no-record disclaimer', async () => {
  const store = new RoomStore(null); store.state.visits = [visit()];
  const commands = new StaffCommands(store, { onCall: async () => {} });
  expect((await commands.run('get_record', { name: 'Anna' })).message).toBe("From Anna's demo record: allergic to penicillin.");
  store.state.visits[0].answers.dateOfBirth = '1997-07-20';
  expect((await commands.run('get_record', { name: 'Anna' })).message).toBe("I don't have earlier records for Anna in this demo system.");
});

it('scopes a doctor record lookup to the selected visit and normalized exam room', async () => {
  const store = new RoomStore(null);
  store.state.visits = [{ ...visit(), status: 'called', room: 'room one' }, { ...visit(), id: 'other', status: 'called', room: '2' }];
  const commands = new StaffCommands(store, { onCall: async () => {} });
  expect((await commands.run('get_record', { name: 'Anna', room: 'Room 1', visitId: 'Anna' })).message).toBe("From Anna's demo record: allergic to penicillin.");
  expect((await commands.run('get_record', { name: 'Anna', room: '2', visitId: 'Anna' })).ok).toBe(false);
  expect((await commands.run('get_record', { name: 'Daniel', room: '1', visitId: 'Anna' })).ok).toBe(false);
});
