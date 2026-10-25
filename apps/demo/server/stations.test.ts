import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAppServer } from './http.ts';

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});
async function start() {
  const { server } = createAppServer({ dataDir: null, readProviders: false });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    list: () => fetch(`${base}/api/stations`),
    post: (body: unknown) => fetch(`${base}/api/stations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    base,
  };
}

it('starts empty and registers one station without exposing patient data', async () => {
  const api = await start();
  const response = await api.list();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ stations: [] });
  const registered = await api.post({ id: 'laptop-b', name: 'Laptop B', role: 'kiosk' });
  expect(registered.status).toBe(200);
  expect(await registered.json()).toMatchObject({ id: 'laptop-b', name: 'Laptop B', role: 'kiosk', online: true });
  expect(await (await api.list()).json()).toEqual({ stations: [expect.objectContaining({ id: 'laptop-b', name: 'Laptop B', role: 'kiosk', online: true, lastSeenAt: expect.any(Number) })] });
});

it('heartbeats replace the same station and role changes clear the old exam room', async () => {
  const api = await start();
  await api.post({ id: 'b', role: 'exam', room: '1' });
  await api.post({ id: 'b', role: 'exam', room: '2' });
  await api.post({ id: 'b', role: 'kiosk' });
  const { stations } = await (await api.list()).json();
  expect(stations).toHaveLength(1);
  expect(stations[0]).toMatchObject({ id: 'b', role: 'kiosk', online: true });
  expect(stations[0]).not.toHaveProperty('room');
});

it('marks a station offline after 30 seconds and revives it on heartbeat', async () => {
  const api = await start();
  const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
  await api.post({ id: 'b', role: 'room' });
  now.mockReturnValue(39_999);
  expect((await (await api.list()).json()).stations[0].online).toBe(true);
  now.mockReturnValue(40_000);
  expect((await (await api.list()).json()).stations[0].online).toBe(false);
  await api.post({ id: 'b', role: 'room' });
  expect((await (await api.list()).json()).stations[0]).toMatchObject({ online: true, lastSeenAt: 40_000 });
});

it.each([
  {}, { id: '', role: 'kiosk' }, { id: 'b', role: 'unknown' },
  { id: 'b', role: 'exam' }, { id: 'b', role: 'exam', room: '4' },
  { id: 'b', role: 'exam', room: 1 }, { id: 'b', role: 'lobby', room: '1' },
  { id: 'b', role: 'kiosk', name: ' ' }, { id: 'b', role: 'kiosk', phone: 'fictional' },
])('rejects invalid registration %j without adding a station', async body => {
  const api = await start();
  expect((await api.post(body)).status).toBe(400);
  expect(await (await api.list()).json()).toEqual({ stations: [] });
});

it('keeps registries local to a server and keeps existing routes available', async () => {
  const first = await start(), second = await start();
  await first.post({ id: 'b', role: 'command' });
  expect(await (await second.list()).json()).toEqual({ stations: [] });
  expect((await fetch(`${first.base}/api/health`)).status).toBe(200);
  expect((await fetch(`${first.base}/api/not-a-route`)).status).toBe(404);
});
