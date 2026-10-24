import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEchoServer } from '../server/src/http.ts';

test('http saves pre-mark readings and keeps another browser session out', async () => {
  const app = createEchoServer({ databasePath: ':memory:' });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const create = () => fetch(base + '/api/sessions', { method: 'POST' });
  try {
    const one = await create(), two = await create();
    const cookie = one.headers.get('set-cookie')!.split(';')[0];
    const other = two.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(base + '/api/live')).status, 401);
    const post = (path: string, value: unknown, origin?: string) => fetch(base + path, {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json', ...(origin ? { origin } : {}) },
      body: JSON.stringify(value),
    });
    assert.equal((await post('/api/samples', { samples: [{
      schemaVersion: 1, deviceId: 'phone', bootId: 'boot', seq: 0, sourceMonotonicMs: 0,
      channel: 'accel_total_x', value: 3, unit: 'm/s2', quality: 'good', provenance: 'live_phone',
    }] })).status, 200);
    const saved = await post('/api/events', { requestId: 'mark', method: 'manual' });
    assert.equal(saved.status, 201);
    const event = await saved.json();
    assert.equal(event.samples[0].value, 3);
    assert.equal((await fetch(base + '/api/events/' + event.id, { headers: { cookie: other } })).status, 404);
    assert.equal((await post('/api/events', { requestId: 'csrf', method: 'manual' }, 'https://unrelated.example')).status, 403);
    assert.equal((await post('/api/samples', { samples: [{ value: 'bad' }] })).status, 400);
  } finally { await app.close(); }
});

test('http pairing is single-use and attaches the phone to the intended session', async () => {
  const app = createEchoServer({ databasePath: ':memory:' });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const created = await fetch(base + '/api/sessions', { method: 'POST' });
    const cookie = created.headers.get('set-cookie')!.split(';')[0];
    const identity = await created.json();
    const paired = await fetch(base + '/api/pair', { method: 'POST', headers: { cookie } });
    const { code } = await paired.json();
    const join = () => fetch(base + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const phone = await join();
    assert.equal(phone.status, 200);
    assert.equal((await phone.json()).sessionId, identity.sessionId);
    assert.ok(phone.headers.get('set-cookie')!.includes('HttpOnly'));
    assert.equal((await join()).status, 400);
  } finally { await app.close(); }
});
