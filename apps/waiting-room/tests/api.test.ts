import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../client/runtime/api.ts';
import { emptyRoom, usableRoom } from '../shared/fixtures.ts';
afterEach(() => vi.unstubAllGlobals());
it('uses same-origin credentials and validates the frozen room response', async () => {
  const calls: Array<[string, RequestInit]> = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push([url,init]); return Response.json(emptyRoom); });
  expect(await api.getRoom()).toEqual(emptyRoom);
  expect(calls[0][0]).toBe('/api/wr/room'); expect(calls[0][1].credentials).toBe('same-origin');
  vi.stubGlobal('fetch', async () => Response.json({ ...emptyRoom, schemaVersion: 99 }));
  await expect(api.getRoom()).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
});
it('serializes typed mutation inputs and propagates structured API failures', async () => {
  const bodies: unknown[] = []; const paths: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { paths.push(url); bodies.push(JSON.parse(init.body as string)); return Response.json(usableRoom.visits[0]); });
  const result = await api.assignSeat('visit_014', { requestId: 'request_seat', label: 'C2' });
  expect(result.id).toBe('visit_014'); expect(paths).toEqual(['/api/wr/visits/visit_014/seat']); expect(bodies).toEqual([{ requestId: 'request_seat', label: 'C2' }]);
  vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'CONFLICT', message: 'Original capture ended' } }, { status: 409 }));
  try { await api.getRoom(); throw new Error('Expected ApiError'); } catch (e) { expect(e).toBeInstanceOf(ApiError); expect(e).toMatchObject({ status: 409, code: 'CONFLICT', message: 'Original capture ended' }); }
});
it('returns a Promise and typed error for invalid local request data', async () => {
  let result!: Promise<unknown>;
  expect(() => { result = api.assignSeat('invalid id', { requestId: 'request_1', label: null }); }).not.toThrow();
  await expect(result).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  const { alignedStartAtMs, alignedEndAtMs, receivedAtMs, ...measurement } = usableRoom.measurements[0];
  expect(() => { result = api.completeCapture('capture_1', { requestId: 'request_1', measurement: { ...measurement, value: Infinity } }); }).not.toThrow();
  await expect(result).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
});
it('clock transport validates both phases and rejects injected server stamps before fetch', async () => {
  const calls:Array<{path:string;body:unknown}>=[];
  vi.stubGlobal('fetch',async(path:string,init:RequestInit)=>{calls.push({path,body:JSON.parse(String(init.body))});return Response.json(calls.length===1?{handshakeId:'h_1',serverReceiveMs:91050,serverSendMs:91050}:{id:'sync_1',sourceId:'source_1',runId:'run_1',offsetMs:90000,uncertaintyMs:50,expiresAtMs:151050});});
  expect(await api.startClockSync({phase:'start',sourceId:'source_1',runId:'run_1',clientSendMs:1000})).toEqual({handshakeId:'h_1',serverReceiveMs:91050,serverSendMs:91050});
  expect((await api.completeClockSync({phase:'complete',handshakeId:'h_1',clientReceiveMs:1100})).offsetMs).toBe(90000);
  await expect(api.completeClockSync({phase:'complete',handshakeId:'h_1',clientReceiveMs:1100,serverSendMs:1} as never)).rejects.toMatchObject({code:'INVALID_REQUEST'});
  expect(calls).toEqual([{path:'/api/wr/clock-sync',body:{phase:'start',sourceId:'source_1',runId:'run_1',clientSendMs:1000}},{path:'/api/wr/clock-sync',body:{phase:'complete',handshakeId:'h_1',clientReceiveMs:1100}}]);
});
