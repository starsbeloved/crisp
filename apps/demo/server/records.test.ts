import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAppServer } from './http.ts';
import { DEMO_RECORDS, RECORDS_LABEL, findDemoRecord, getRecord } from './records.ts';
import type { Visit } from '../shared/types.ts';

const visit = (extra: Partial<Visit> = {}): Visit => ({ id: 'ama', name: 'Ama', queueNo: 1, createdAt: 1000, status: 'called', calledAt: 2000, room: 'Room 1', faceEnrolled: true, summary: null, answers: { reason: 'My own words', reasonChips: [], onset: 'today', trend: 'worse', followUp: null, via: 'form', dateOfBirth: '1994-06-15' }, ...extra });
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }))); });

describe('fictional records', () => {
  it('seeds 4–6 fictional histories and requires exact name and DOB', () => {
    expect(DEMO_RECORDS.length).toBeGreaterThanOrEqual(4);
    expect(DEMO_RECORDS.length).toBeLessThanOrEqual(6);
    expect(findDemoRecord('Ama', '1994-06-15')?.allergies).toEqual(['Penicillin, recorded 2023 (demo record)']);
    expect(findDemoRecord(' ama ', '1994-06-15')?.name).toBe('Ama');
    for (const [name, dob] of [['Am', '1994-06-15'], ['Ama', null], ['Ama', '1994-06-16'], ['Ama Jones', '1994-06-15'], ['Ama', '1994-02-30']]) {
      expect(findDemoRecord(name!, dob)).toBeNull();
    }
  });
  it('never uses a unique prefix or an ambiguous checked-in name to guess a record', () => {
    expect(getRecord([visit()], { name: 'Am' }).message).toBe('No patient found');
    expect(getRecord([visit(), visit({ id: 'other' })], { name: 'Ama' }).message).toContain('ambiguous');
    expect(getRecord([visit()], { name: 'Ama', room: '2' }).record).toBeNull();
    expect(getRecord([visit()], { name: 'Ama', room: '1' })).toMatchObject({ label: RECORDS_LABEL, visitId: 'ama', allergyText: 'Penicillin, recorded 2023 (demo record)' });
    expect(getRecord([visit({ answers: { ...visit().answers, dateOfBirth: null } })], { name: 'Ama' }).message).toBe('No prior record found');
  });
  it('reads an empty recorded allergy list as None recorded', () => {
    const ben = visit({ name: 'Ben', answers: { ...visit().answers, dateOfBirth: '1988-11-02' } });
    expect(getRecord([ben], { name: 'Ben' }).allergyText).toBe('None recorded');
  });
  it('serves visit records and a room-scoped called-patient gallery without modifying the waiting-room gallery', async () => {
    const { server, store } = createAppServer({ readProviders: false, dataDir: null }); servers.push(server);
    store.state.visits = [visit(), visit({ id: 'waiting', status: 'waiting', calledAt: null, room: null }), visit({ id: 'room2', room: '2' })];
    store.descriptors = { ama: [[0.1, 0.2]], waiting: [[0.3, 0.4]], room2: [[0.5, 0.6]] };
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/records?visitId=ama`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ label: RECORDS_LABEL, record: { name: 'Ama' } });
    expect((await fetch(`${base}/api/records?visitId=missing`)).status).toBe(404);
    expect(await (await fetch(`${base}/api/exam/gallery?room=1`)).json()).toEqual([{ visitId: 'ama', name: 'Ama', descriptor: [0.1, 0.2] }]);
    expect((await (await fetch(`${base}/api/gallery`)).json()).map((entry: { visitId: string }) => entry.visitId)).toEqual(['waiting']);
    const query = await fetch(`${base}/api/records/get_record`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ama', room: '1', visitId: 'ama' }) });
    expect(await query.json()).toMatchObject({ allergyText: 'Penicillin, recorded 2023 (demo record)' });
    expect((await fetch(`${base}/api/records/get_record`, { method: 'POST', body: '{}' })).status).toBe(400);
  });
});
