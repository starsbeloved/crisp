import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClockError, completeClockSync, createClockService } from '../server/clock.ts';
import type { ClockPrincipal } from '../server/clock.ts';
const station: ClockPrincipal = { sessionId: 'station_internal_1', role: 'station', visitId: null };
const phone: ClockPrincipal = { sessionId: 'phone_internal_1', role: 'ppg', visitId: 'visit_1' };
const times = { sourceId: 'source_1', runId: 'run_1', clientSendMs: 1000, clientReceiveMs: 1100, serverReceiveMs: 91050, serverSendMs: 91050 };
function setup(principal = station) {
  let now = 91050;
  const clock = createClockService({ now: () => now });
  const handshake = clock.start(principal, { phase: 'start', sourceId: 'source_1', runId: 'run_1', clientSendMs: 1000 });
  const sync = clock.complete(principal, { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 1100 });
  return { clock, handshake, sync, setNow: (value:number) => { now = value; } };
}
function expectClockError(fn: () => unknown, code: string) { try { fn(); throw new Error('Expected clock failure'); } catch (error) { expect(error).toBeInstanceOf(ClockError); expect(error).toMatchObject({ code }); } }
describe('NTP-style offset math', () => {
  it('maps clocks 90s apart with 100ms RTT and keeps uncertainty', () => expect(completeClockSync(times)).toEqual({ offsetMs: 90000, uncertaintyMs: 50 }));
  it.each([{ clientReceiveMs: 999 }, { clientReceiveMs: 2001 }, { serverSendMs: 91049 }, { serverSendMs: 91200 }, { clientSendMs: Infinity }, { clientReceiveMs: NaN }, { serverReceiveMs: -1 }])('rejects invalid interval %j', patch => expectClockError(() => completeClockSync({ ...times, ...patch }), 'CLOCK_INTERVAL_INVALID'));
  it('accepts exactly 1000ms RTT and accounts for server processing', () => {
    expect(completeClockSync({ ...times, clientReceiveMs: 2000 })).toEqual({ offsetMs: 89550, uncertaintyMs: 500 });
    expect(completeClockSync({ ...times, serverSendMs: 91070 })).toEqual({ offsetMs: 90010, uncertaintyMs: 40 });
  });
});
describe('authenticated ephemeral handshake registry', () => {
  it('uses only server-owned handshake times and returns a stable duplicate completion', () => {
    const { clock, handshake, sync } = setup();
    expect(sync).toMatchObject({ sourceId: 'source_1', runId: 'run_1', offsetMs: 90000, uncertaintyMs: 50, expiresAtMs: 151050 });
    expect(clock.complete(station, { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 1100 })).toEqual(sync);
    expectClockError(() => clock.complete(station, { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 1200 }), 'CLOCK_HANDSHAKE_CONFLICT');
    expectClockError(() => clock.complete(station, { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 1100, serverSendMs: 91050 }), 'CLOCK_INPUT_INVALID');
  });
  it('rejects invented handshake/sync IDs and wrong session/role/visit/source/run', () => {
    const { clock, handshake, sync } = setup();
    expectClockError(() => clock.complete(station, { phase: 'complete', handshakeId: 'invented', clientReceiveMs: 1100 }), 'CLOCK_HANDSHAKE_UNKNOWN');
    expectClockError(() => clock.getSync(station, { syncId: 'invented', sourceId: 'source_1', runId: 'run_1' }), 'CLOCK_SYNC_UNKNOWN');
    for (const principal of [{ ...station, sessionId: 'another' }, { ...station, role: 'ppg' as const, visitId: 'visit_1' }, { ...station, visitId: 'visit_1' }]) {
      expectClockError(() => clock.complete(principal, { phase: 'complete', handshakeId: handshake.handshakeId, clientReceiveMs: 1100 }), 'CLOCK_SCOPE_MISMATCH');
      expectClockError(() => clock.getSync(principal, { syncId: sync.id, sourceId: 'source_1', runId: 'run_1' }), 'CLOCK_SCOPE_MISMATCH');
    }
    expectClockError(() => clock.getSync(station, { syncId: sync.id, sourceId: 'source_1', runId: 'different' }), 'CLOCK_SCOPE_MISMATCH');
  });
  it('expires live mappings after 60s and fails a late handshake without refreshing it', () => {
    const { clock, sync, setNow } = setup();
    setNow(151050); expect(clock.getSync(station, { syncId: sync.id, sourceId: 'source_1', runId: 'run_1' })).toEqual(sync);
    setNow(151051); expectClockError(() => clock.getSync(station, { syncId: sync.id, sourceId: 'source_1', runId: 'run_1' }), 'CLOCK_SYNC_EXPIRED');
    const h = clock.start(station, { phase: 'start', sourceId: 'source_1', runId: 'run_1', clientSendMs: 62000 });
    setNow(211052); expectClockError(() => clock.complete(station, { phase: 'complete', handshakeId: h.handshakeId, clientReceiveMs: 62100 }), 'CLOCK_HANDSHAKE_EXPIRED');
  });
  it('clears all registry state on dispose and does not expose mutable sync internals', () => {
    const { clock, sync } = setup(); sync.offsetMs = 999;
    expect(clock.getLatestSync(station, { sourceId: 'source_1', runId: 'run_1' }).offsetMs).toBe(90000);
    clock.dispose(); expectClockError(() => clock.getLatestSync(station, { sourceId: 'source_1', runId: 'run_1' }), 'CLOCK_SYNC_UNKNOWN');
  });
});
describe('source alignment', () => {
  it('preserves old measurement intervals instead of anchoring to receipt', () => {
    const { clock, sync, setNow } = setup(); setNow(100000);
    expect(clock.alignInterval(station, { syncId: sync.id, sourceId: 'source_1', runId: 'run_1', sourceStartAtMs: 1100, sourceEndAtMs: 1200 })).toEqual({ alignedStartAtMs: 91100, alignedEndAtMs: 91200, receivedAtMs: 100000, uncertaintyMs: 50 });
  });
  it('rejects future >2000ms, negative windows and client-owned aligned/receipt fields', () => {
    const { clock, sync } = setup(); const base = { syncId: sync.id, sourceId: 'source_1', runId: 'run_1', sourceStartAtMs: 1100, sourceEndAtMs: 1100 };
    expectClockError(() => clock.alignInterval(station, { ...base, sourceEndAtMs: 3051 }), 'CLOCK_SOURCE_FUTURE');
    expect(clock.alignInterval(station, { ...base, sourceEndAtMs: 3050 }).alignedEndAtMs).toBe(93050);
    expectClockError(() => clock.alignInterval(station, { ...base, sourceEndAtMs: 1000 }), 'CLOCK_INTERVAL_INVALID');
    expectClockError(() => clock.alignInterval(station, { ...base, receivedAtMs: 1 } as never), 'CLOCK_INPUT_INVALID');
    expectClockError(() => clock.alignInstant(station, { syncId: sync.id, sourceId: 'source_1', runId: 'run_1', sourceAtMs: 1100, alignedAtMs: 1000 } as never), 'CLOCK_INPUT_INVALID');
  });
  it('aligns BindingBatch and every nested source time with the same mapping', () => {
    const { clock, sync, setNow } = setup(); setNow(92000);
    const batch = { schemaVersion: 1 as const, id: 'binding_1', sourceId: 'source_1', runId: 'run_1', streamId: 'binding' as const, seq: 1, syncId: sync.id, sourceAtMs: 2000, bindings: [{ trackId: 'track_1', visitId: 'visit_1', identityEpoch: 'epoch_1', state: 'matched' as const, bounds: { x: 0, y: 0, width: 1, height: 1 }, sourceSinceAtMs: 1200, sourceLastVerifiedAtMs: 1900, observedLocation: { label: 'B4', sourceObservedAtMs: 1800 } }] };
    const aligned = clock.alignBindingBatch(station, batch);
    expect(aligned.alignedAtMs).toBe(92000);
    expect(aligned.bindings[0]).toMatchObject({ sinceMs: 91200, lastVerifiedAtMs: 91900, observedLocation: { label: 'B4', observedAtMs: 91800 } });
    expect(aligned.input).toEqual(batch);
    expectClockError(() => clock.alignBindingBatch(station, { ...batch, bindings: [{ ...batch.bindings[0], sourceLastVerifiedAtMs: 2001 }] }), 'CLOCK_INPUT_INVALID');
    expectClockError(() => clock.alignBindingBatch(station, { ...batch, bindings: [{ ...batch.bindings[0], observedLocation: { label: 'B4', sourceObservedAtMs: 1000 } }] }), 'CLOCK_INTERVAL_INVALID');
  });
});
describe('frozen phone capture mapping helpers (not backend capture lifecycle)', () => {
  it('allows original mapping after live expiry only inside its capture interval, without realigning', () => {
    const { clock, sync, setNow } = setup(phone);
    const frozen = clock.freezeCapture(phone, { captureId: 'capture_1', visitId: 'visit_1', sourceId: 'source_1', runId: 'run_1' });
    const input = { syncId: sync.id, sourceId: 'source_1', runId: 'run_1', sourceStartAtMs: 1100, sourceEndAtMs: 31100 };
    setNow(191050);
    expect(clock.alignCaptureInterval(phone, frozen, input)).toEqual({ alignedStartAtMs: 91100, alignedEndAtMs: 121100, receivedAtMs: 191050, uncertaintyMs: 50 });
    expectClockError(() => clock.alignInterval(phone, input), 'CLOCK_SYNC_EXPIRED');
    const newer = clock.start(phone, { phase: 'start', sourceId: 'source_1', runId: 'run_1', clientSendMs: 101000 });
    const freshSync = clock.complete(phone, { phase: 'complete', handshakeId: newer.handshakeId, clientReceiveMs: 101100 });
    expectClockError(() => clock.alignCaptureInterval(phone, frozen, { ...input, syncId: freshSync.id }), 'CLOCK_SCOPE_MISMATCH');
    expectClockError(() => clock.alignCaptureInterval(phone, frozen, { ...input, sourceEndAtMs: 61101 }), 'CLOCK_CAPTURE_INTERVAL');
    setNow(frozen.expiresAtMs + 1); expectClockError(() => clock.alignCaptureInterval(phone, frozen, input), 'CLOCK_CAPTURE_EXPIRED');
  });
  it('binds frozen capture to authenticated visit, session, source and run', () => {
    const { clock, sync } = setup(phone);
    expectClockError(() => clock.freezeCapture(phone, { captureId: 'capture_1', visitId: 'visit_2', sourceId: 'source_1', runId: 'run_1' }), 'CLOCK_SCOPE_MISMATCH');
    const frozen = clock.freezeCapture(phone, { captureId: 'capture_1', visitId: 'visit_1', sourceId: 'source_1', runId: 'run_1' });
    expectClockError(() => clock.alignCaptureInterval({ ...phone, sessionId: 'new_session' }, frozen, { syncId: sync.id, sourceId: 'source_1', runId: 'run_1', sourceStartAtMs: 1100, sourceEndAtMs: 1110 }), 'CLOCK_SCOPE_MISMATCH');
  });
});
