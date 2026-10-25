import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAppServer } from './http.ts';
import { DEMO_RECORDS, RECORDS_LABEL, findDemoRecord, getRecord } from './records.ts';
import type { Visit } from '../shared/types.ts';

const visit = (extra: Partial<Visit> = {}): Visit => ({ id: 'anna', name: 'Anna', queueNo: 1, createdAt: 1000, status: 'called', calledAt: 2000, room: 'Room 1', faceEnrolled: true, summary: null, answers: { reason: 'My own words', reasonChips: [], onset: 'today', trend: 'worse', followUp: null, via: 'form', dateOfBirth: '1997-07-21' }, ...extra });
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }))); });

describe('fictional records', () => {
  it('seeds exactly three fictional histories and matches first name with DOB or unique name alone', () => {
    expect(DEMO_RECORDS.map(({ name, dateOfBirth }) => ({ name, dateOfBirth }))).toEqual([
      { name: 'Jason Miller', dateOfBirth: '1990-03-12' },
      { name: 'Daniel Kim', dateOfBirth: '1985-11-02' },
      { name: 'Anna Lopez', dateOfBirth: '1997-07-21' },
    ]);
    for (const record of DEMO_RECORDS) {
      const name = record.name.split(' ')[0];
      expect(findDemoRecord(name, record.dateOfBirth)).toEqual(record);
      expect(findDemoRecord(` ${record.name.toUpperCase()} `, record.dateOfBirth)).toEqual(record);
      expect(findDemoRecord(` ${name.toLowerCase()} `, null)).toEqual(record);
      expect(findDemoRecord(name, undefined)).toEqual(record);
      expect(findDemoRecord(name, '2000-01-01')).toBeNull();
      expect(record.allergies.length).toBeGreaterThan(0);
      expect(record.medications.length).toBeGreaterThan(0);
      expect(record.problems.length).toBeGreaterThan(0);
      expect(record.pastVisits).toHaveLength(2);
    }
    expect(findDemoRecord('Anna', '1997-07-21')?.allergies).toEqual(['Penicillin']);
    for (const [name, dob] of [['An', '1997-07-21'], ['Anna', '1997-07-22'], ['Anna Jones', '1997-07-21'], ['Anna', '1997-02-30'], ['Ama', null]]) {
      expect(findDemoRecord(name!, dob)).toBeNull();
    }
  });
  it('never uses a unique prefix or an ambiguous checked-in name to guess a record', () => {
    expect(getRecord([visit()], { name: 'An' })).toMatchObject({ visitId: null, record: null, allergyText: null, message: 'No patient found' });
    for (const visits of [
      [visit(), visit({ id: 'other', answers: { ...visit().answers, dateOfBirth: '2000-01-01' } })],
      [visit({ name: 'Anna Lopez' }), visit({ id: 'other', name: 'Anna Jones' })],
    ]) {
      expect(getRecord(visits, { name: 'Anna' })).toMatchObject({ visitId: null, record: null, allergyText: null, message: 'Patient name is ambiguous; select the visit on screen' });
    }
    expect(getRecord([visit()], { name: 'Anna', room: '2' }).record).toBeNull();
    expect(getRecord([visit()], { name: 'Anna', room: '1' })).toMatchObject({ label: RECORDS_LABEL, visitId: 'anna', allergyText: 'Penicillin', message: 'Matched by first name + date of birth' });
    expect(getRecord([visit({ answers: { ...visit().answers, dateOfBirth: null } })], { name: 'Anna' })).toMatchObject({ record: { name: 'Anna Lopez' }, allergyText: 'Penicillin', message: 'matched by name only' });
  });
  it('returns no history for a wrong DOB or a name outside the demo records', () => {
    const wrongDob = visit({ answers: { ...visit().answers, dateOfBirth: '1997-07-22' } });
    expect(getRecord([wrongDob], { name: 'Anna' })).toEqual({ label: RECORDS_LABEL, visitId: 'anna', record: null, allergyText: null, message: "I don't have earlier records for Anna in this demo system." });
    const ben = visit({ name: 'Ben', answers: { ...visit().answers, dateOfBirth: '1988-11-02' } });
    expect(getRecord([ben], { name: 'Ben' })).toMatchObject({ record: null, allergyText: null, message: "I don't have earlier records for Ben in this demo system." });
  });
  it('serves visit records and a room-scoped called-patient gallery without modifying the waiting-room gallery', async () => {
    const { server, store } = createAppServer({ readProviders: false, dataDir: null }); servers.push(server);
    store.state.visits = [visit(), visit({ id: 'waiting', status: 'waiting', calledAt: null, room: null }), visit({ id: 'room2', room: '2' })];
    store.descriptors = { anna: [[0.1, 0.2]], waiting: [[0.3, 0.4]], room2: [[0.5, 0.6]] };
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/records?visitId=anna`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ label: RECORDS_LABEL, record: { name: 'Anna Lopez', dateOfBirth: '1997-07-21' } });
    expect((await fetch(`${base}/api/records?visitId=missing`)).status).toBe(404);
    expect(await (await fetch(`${base}/api/exam/gallery?room=1`)).json()).toEqual([{ visitId: 'anna', name: 'Anna', descriptor: [0.1, 0.2] }]);
    expect((await (await fetch(`${base}/api/gallery`)).json()).map((entry: { visitId: string }) => entry.visitId)).toEqual(['waiting']);
    const query = await fetch(`${base}/api/records/get_record`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Anna', room: '1', visitId: 'anna' }) });
    expect(await query.json()).toMatchObject({ allergyText: 'Penicillin' });
    expect((await fetch(`${base}/api/records/get_record`, { method: 'POST', body: '{}' })).status).toBe(400);
  });
});
