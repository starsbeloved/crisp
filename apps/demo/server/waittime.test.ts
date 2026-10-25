import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Visit } from '../shared/types.ts';
import { createAppServer } from './http.ts';
import { estimateWaitTimes } from './waittime.ts';

function visit(queueNo: number, calledMinute: number | null = null): Visit {
  return {
    id: `visit-${queueNo}`, queueNo, name: 'Ama Private', createdAt: queueNo * 1000,
    faceEnrolled: false, status: calledMinute === null ? 'waiting' : 'called',
    calledAt: calledMinute === null ? null : calledMinute * 60_000, room: null,
    answers: { reason: 'Private complaint', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form', phone: '555-0100', dateOfBirth: '2000-01-01' },
    summary: null,
  };
}

describe('wait-time estimates', () => {
  it('uses the 12-minute fallback until two call-ins exist, counting only people still waiting', () => {
    for (const calls of [[], [visit(1, 0)]]) {
      const visits = [...calls, visit(6), visit(3), visit(9)];
      expect(estimateWaitTimes(visits)).toEqual({
        minutesBetweenCalls: 12, usingFallback: true,
        waiting: [
          { queueNo: 3, initial: 'A.', peopleAhead: 0, minutes: 0 },
          { queueNo: 6, initial: 'A.', peopleAhead: 1, minutes: 12 },
          { queueNo: 9, initial: 'A.', peopleAhead: 2, minutes: 24 },
        ],
      });
      expect(visits.map(v => v.queueNo)).toEqual([...calls.map(v => v.queueNo), 6, 3, 9]);
    }
  });

  it('uses only the last five call-ins, sorted by time, and takes the median of their four gaps', () => {
    // Last five: 100, 108, 120, 134, 234. Gaps 8, 12, 14, 100 → median 13.
    const calls = [visit(1, 0), visit(2, 100), visit(3, 108), visit(4, 120), visit(5, 134), visit(6, 234)];
    expect(estimateWaitTimes([calls[5], ...calls.slice(0, 5), visit(8), visit(7)]))
      .toEqual({ minutesBetweenCalls: 13, usingFallback: false, waiting: [
        { queueNo: 7, initial: 'A.', peopleAhead: 0, minutes: 0 },
        { queueNo: 8, initial: 'A.', peopleAhead: 1, minutes: 13 },
      ] });
  });

  it('uses the single available interval and rounds only the final per-person estimate', () => {
    const result = estimateWaitTimes([visit(1, 0), visit(2, 12.5), visit(3), visit(4), visit(5)]);
    expect(result.minutesBetweenCalls).toBe(12.5);
    expect(result.waiting.map(v => v.minutes)).toEqual([0, 13, 25]);
  });

  it('handles simultaneous calls, no waiting patients, and missing call timestamps', () => {
    expect(estimateWaitTimes([visit(1, 0), visit(2, 0), visit(3), visit(4)]).waiting.map(v => v.minutes)).toEqual([0, 0]);
    expect(estimateWaitTimes([visit(1, 0)]).waiting).toEqual([]);
    expect(estimateWaitTimes([{ ...visit(1), status: 'called' }, visit(2)]).usingFallback).toBe(true);
  });

  it('returns only the first initial, including Unicode names', () => {
    expect(estimateWaitTimes([{ ...visit(1), name: '  émilie Private' }]).waiting[0].initial).toBe('É.');
  });
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});

it('serves an uncached public board without names, answers, vitals, or alerts', async () => {
  const { server, store } = createAppServer({ dataDir: null, readProviders: false });
  servers.push(server);
  store.state.visits = [visit(1, 0), visit(2, 10), visit(3), visit(4)];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await fetch(`${base}/api/waittime`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ minutesBetweenCalls: 10, usingFallback: false, waiting: [
    { queueNo: 3, initial: 'A.', peopleAhead: 0, minutes: 0 },
    { queueNo: 4, initial: 'A.', peopleAhead: 1, minutes: 10 },
  ] });
  store.state.visits = [];
  expect((await (await fetch(`${base}/api/waittime`)).json()).waiting).toEqual([]);
});
