import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../server/store.ts';
import { MjpegBuffer } from '../server/mjpeg.ts';
import { createAppServer } from '../server/http.ts';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { CheckInAnswers, Observation, RoomState } from '../shared/types.ts';

const answers: CheckInAnswers = {
  reason: 'Headache', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form',
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); })));
});

async function start() {
  const { server } = createAppServer({ readProviders: false, dataDir: null });
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}`;
}

async function post(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function stateFromStream(base: string): Promise<RoomState> {
  const response = await fetch(`${base}/api/events`);
  const reader = response.body!.getReader();
  let text = '';
  for (let n = 0; n < 5; n++) {
    const part = await reader.read();
    text += new TextDecoder().decode(part.value);
    const match = text.match(/event: state\ndata: (.*)\n\n/);
    if (match) {
      await reader.cancel();
      return JSON.parse(match[1]);
    }
  }
  await reader.cancel();
  throw new Error('No state event received');
}

describe('P0 server smoke', () => {
  it('emits a created visit to the state stream and gallery', async () => {
    const base = await start();
    const stream = await fetch(`${base}/api/events`);
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const reader = stream.body!.getReader();
    const visitResponse = await post(base, '/api/visits', { name: 'Ama', descriptor: [0.1, 0.2], answers });
    expect(visitResponse.status).toBe(201);
    const visit = await visitResponse.json();
    expect(visit).toMatchObject({ name: 'Ama', queueNo: 1, faceEnrolled: true, status: 'waiting' });
    expect(await (await fetch(`${base}/api/gallery`)).json()).toEqual([
      { visitId: visit.id, name: 'Ama', descriptor: [0.1, 0.2] },
    ]);
    let events = '';
    for (let n = 0; n < 5 && !events.includes('"name":"Ama"'); n++) {
      const next = await reader.read();
      events += new TextDecoder().decode(next.value);
    }
    expect(events).toContain('event: state');
    expect(events).toContain('"name":"Ama"');
    expect(events).not.toContain('descriptor');
    await reader.cancel();
  });

  it('streams the uploaded JPEG and records camera visibility', async () => {
    const base = await start();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const upload = await fetch(`${base}/api/frame?cam=A&source=replay&visible=0`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: bytes,
    });
    expect(upload.status).toBe(200);
    const state = await stateFromStream(base);
    expect(state.cameras.A).toMatchObject({ cameraId: 'A', source: 'replay', visible: false });
    const stream = await fetch(`${base}/api/stream.mjpg?cam=A`);
    expect(stream.headers.get('content-type')).toContain('multipart/x-mixed-replace');
    const reader = stream.body!.getReader();
    let received = Buffer.alloc(0);
    try {
      while (!received.includes(Buffer.from(bytes))) {
        const part = await reader.read();
        if (part.done) break;
        received = Buffer.concat([received, Buffer.from(part.value)]);
      }
      expect(received.includes(Buffer.from(bytes))).toBe(true);
    } finally { await reader.cancel(); }
  });

  it('writes honest vitals from observations without opening an alert', async () => {
    const base = await start();
    const visit = await (await post(base, '/api/visits', { name: 'Ama', descriptor: null, answers })).json();
    const observation: Observation = {
      cameraId: 'A', trackId: 'face-1', at: Date.now(), visitId: visit.id, matchScore: 0.9,
      box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, hrBpm: 86, hrQuality: 'good',
      rrBpm: null, rrQuality: 'none', posture: null, hint: null, pulseTrace: [0.1, -0.1], source: 'live',
    };
    expect((await post(base, '/api/observations', { observations: [observation] })).status).toBe(200);
    const state = await stateFromStream(base);
    expect(state.vitals[visit.id]).toMatchObject({ hrBpm: 86, rrBpm: null, level: 'none' });
    expect(state.alerts).toEqual([]);
  });

  it('caps corrected descriptors and removes called visits from the gallery', async () => {
    const base = await start();
    const visit = await (await post(base, '/api/visits', { name: 'Ama', descriptor: [0], answers })).json();
    for (let i = 1; i <= 7; i++) expect((await post(base, `/api/gallery/${visit.id}/descriptor`, { descriptor: [i] })).status).toBe(200);
    const gallery = await (await fetch(`${base}/api/gallery`)).json();
    expect(gallery.map((entry: { descriptor: number[] }) => entry.descriptor)).toEqual([[3], [4], [5], [6], [7]]);
    expect(await (await post(base, '/api/reference', { visitId: visit.id, referenceBpm: 80 })).json()).toMatchObject({ visitId: visit.id, referenceBpm: 80, cameraBpm: null });
    expect(await (await post(base, `/api/visits/${visit.id}/call-in`, { room: '2' })).json()).toMatchObject({ name: 'Ama', room: '2' });
    expect(await (await fetch(`${base}/api/gallery`)).json()).toEqual([]);
    const state = await stateFromStream(base);
    expect(state.handoffs[visit.id]).toMatchObject({ source: 'template' });
    expect(state.nowCalling?.audio).toBe('failed');
  });

  it('persists descriptors separately and archives state on reset', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'crisp-p0-'));
    const store = new RoomStore(dataDir);
    store.descriptors.test = [[0.1]];
    store.flush();
    expect(new RoomStore(dataDir).descriptors.test).toEqual([[0.1]]);
    const saved = readFileSync(join(dataDir, 'state.json'), 'utf8');
    store.reset();
    const archived = readdirSync(join(dataDir, 'trash'));
    expect(archived).toHaveLength(1);
    expect(readFileSync(join(dataDir, 'trash', archived[0]), 'utf8')).toBe(saved);
    expect(store.gallery()).toEqual([]);
    expect(store.state.visits).toEqual([]);
    store.flush();
  });

  it('copies only the last 15 seconds of camera frames into a stable alert replay', () => {
    const frames = new MjpegBuffer();
    for (let t = 0; t <= 40_000; t += 200) frames.push('A', new Uint8Array([t / 200]), t);
    expect(frames.capture('alert-1', 'A', 40_000)).toBe(76);
    expect(frames.replay('alert-1', 0)).toEqual(new Uint8Array([125]));
    frames.push('A', new Uint8Array([255]), 80_000);
    expect(frames.replay('alert-1', 0)).toEqual(new Uint8Array([125]));
    expect(frames.replay('alert-1', 76)).toBeNull();
  });

});
