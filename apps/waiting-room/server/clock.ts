import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Binding, BindingBatch, ClockSync, ID } from '../shared/contracts.ts';
import { bindingBatchSchema, idSchema } from '../shared/schemas.ts';
export type ClockPrincipal = { sessionId:string; role:'station'|'ppg'|'questionnaire'|'patient'; visitId:ID|null };
export type ClockStart = { phase:'start'; sourceId:ID; runId:ID; clientSendMs:number };
export type ClockComplete = { phase:'complete'; handshakeId:ID; clientReceiveMs:number };
export type ClockHandshake = { handshakeId:ID; serverReceiveMs:number; serverSendMs:number };
export type AlignedInterval = { alignedStartAtMs:number; alignedEndAtMs:number; receivedAtMs:number; uncertaintyMs:number };
export type FrozenCaptureClock = { captureId:ID; visitId:ID; sourceId:ID; runId:ID; syncId:ID; startedAtMs:number; expiresAtMs:number };
export class ClockError extends Error {
  readonly status:number; readonly code:string;
  constructor(status:number, code:string, message:string) { super(message); this.name = 'ClockError'; this.status = status; this.code = code; }
}
const fail = (code:string, message:string, status = 400):never => { throw new ClockError(status, code, message); };
const time = z.number().finite().nonnegative();
const sourceShape = { sourceId:idSchema, runId:idSchema };
const syncShape = { ...sourceShape, syncId:idSchema };
const startSchema = z.strictObject({ ...sourceShape, phase:z.literal('start'), clientSendMs:time });
const completeSchema = z.strictObject({ phase:z.literal('complete'), handshakeId:idSchema, clientReceiveMs:time });
const intervalSchema = z.strictObject({ ...syncShape, sourceStartAtMs:time, sourceEndAtMs:time });
const instantSchema = z.strictObject({ ...syncShape, sourceAtMs:time });
function parse<T>(schema:z.ZodType<T>, input:unknown):T { const result = schema.safeParse(input); return result.success ? result.data : fail('CLOCK_INPUT_INVALID', 'Invalid clock input'); }
function samePrincipal(a:ClockPrincipal, b:ClockPrincipal) { if (a.sessionId !== b.sessionId || a.role !== b.role || a.visitId !== b.visitId) fail('CLOCK_SCOPE_MISMATCH', 'Clock scope does not match session', 403); }
export function completeClockSync(input:{sourceId:ID;runId:ID;clientSendMs:number;clientReceiveMs:number;serverReceiveMs:number;serverSendMs:number}):{offsetMs:number;uncertaintyMs:number} {
  const { clientSendMs:c0, clientReceiveMs:c3, serverReceiveMs:s1, serverSendMs:s2 } = input;
  const rtt = c3-c0, processing = s2-s1;
  if (![c0,c3,s1,s2].every(v => Number.isFinite(v) && v >= 0) || rtt < 0 || rtt > 1000 || processing < 0 || processing > rtt) fail('CLOCK_INTERVAL_INVALID', 'Invalid clock round trip');
  return { offsetMs:((s1-c0)+(s2-c3))/2, uncertaintyMs:(rtt-processing)/2 };
}
export function createClockService({ now = Date.now }:{now?:()=>number} = {}) {
  type HandshakeRecord = { principal:ClockPrincipal; input:ClockStart; handshake:ClockHandshake; completed?:{clientReceiveMs:number;sync:ClockSync} };
  type SyncRecord = { principal:ClockPrincipal; sync:ClockSync };
  const handshakes = new Map<ID, HandshakeRecord>();
  const syncs = new Map<ID, SyncRecord>();
  // Objects are server-owned capabilities: a serialized or copied body cannot become a capture.
  const captures = new Map<FrozenCaptureClock, { principal:ClockPrincipal; frozen:FrozenCaptureClock; sync:ClockSync }>();
  const latest = new Map<string,ID>();
  const scopeKey = (p:ClockPrincipal, s:{sourceId:ID;runId:ID}) => JSON.stringify([p.sessionId,p.role,p.visitId,s.sourceId,s.runId]);
  function stamp() { const value = now(); if (!Number.isFinite(value) || value < 0) fail('CLOCK_INTERVAL_INVALID', 'Service clock unavailable', 503); return value; }
  function getSync(p:ClockPrincipal, raw:{syncId:ID;sourceId:ID;runId:ID}):ClockSync {
    const input = parse(z.strictObject(syncShape), raw), record = syncs.get(input.syncId);
    if (!record) return fail('CLOCK_SYNC_UNKNOWN', 'Unknown clock sync', 409);
    samePrincipal(p, record.principal);
    if (record.sync.sourceId !== input.sourceId || record.sync.runId !== input.runId) fail('CLOCK_SCOPE_MISMATCH', 'Clock source or run differs', 403);
    if (stamp() > record.sync.expiresAtMs) fail('CLOCK_SYNC_EXPIRED', 'Clock sync expired', 409);
    return { ...record.sync };
  }
  function getLatestSync(p:ClockPrincipal, raw:{sourceId:ID;runId:ID}) {
    const input = parse(z.strictObject(sourceShape), raw), id = latest.get(scopeKey(p,input));
    if (!id) return fail('CLOCK_SYNC_UNKNOWN', 'No clock sync for source', 409);
    return getSync(p, { ...input, syncId:id });
  }
  function aligned(value:number, sync:ClockSync, receipt:number) {
    const result = value + sync.offsetMs;
    if (!Number.isFinite(result) || result < 0) fail('CLOCK_INTERVAL_INVALID', 'Invalid aligned time');
    if (result > receipt + 2000) fail('CLOCK_SOURCE_FUTURE', 'Source time is in the future');
    return result;
  }
  function interval(input:z.infer<typeof intervalSchema>, sync:ClockSync, receivedAtMs:number):AlignedInterval {
    if (input.sourceStartAtMs > input.sourceEndAtMs) fail('CLOCK_INTERVAL_INVALID', 'Reversed source interval');
    return { alignedStartAtMs:aligned(input.sourceStartAtMs,sync,receivedAtMs), alignedEndAtMs:aligned(input.sourceEndAtMs,sync,receivedAtMs), receivedAtMs, uncertaintyMs:sync.uncertaintyMs };
  }
  return {
    start(p:ClockPrincipal, raw:unknown):ClockHandshake {
      const serverReceiveMs = stamp(), input = parse(startSchema,raw);
      const handshake = { handshakeId:randomUUID(), serverReceiveMs, serverSendMs:stamp() };
      handshakes.set(handshake.handshakeId, { principal:{...p}, input, handshake });
      return {...handshake};
    },
    complete(p:ClockPrincipal, raw:unknown):ClockSync {
      const input = parse(completeSchema,raw), record = handshakes.get(input.handshakeId);
      if (!record) return fail('CLOCK_HANDSHAKE_UNKNOWN', 'Unknown clock handshake', 409);
      samePrincipal(p,record.principal);
      if (stamp() > record.handshake.serverSendMs + 60000) fail('CLOCK_HANDSHAKE_EXPIRED', 'Clock handshake expired', 409);
      if (record.completed) {
        if (record.completed.clientReceiveMs !== input.clientReceiveMs) fail('CLOCK_HANDSHAKE_CONFLICT', 'Handshake already completed differently', 409);
        return {...record.completed.sync};
      }
      const sync = { id:randomUUID(), sourceId:record.input.sourceId, runId:record.input.runId, ...completeClockSync({...record.input,...record.handshake,clientReceiveMs:input.clientReceiveMs}), expiresAtMs:record.handshake.serverSendMs + 60000 };
      record.completed = { clientReceiveMs:input.clientReceiveMs, sync };
      syncs.set(sync.id,{principal:{...p},sync});
      latest.set(scopeKey(p,sync),sync.id);
      return {...sync};
    },
    getSync, getLatestSync,
    alignInterval(p:ClockPrincipal, raw:z.infer<typeof intervalSchema>):AlignedInterval { const input = parse(intervalSchema,raw); return interval(input,getSync(p,{syncId:input.syncId,sourceId:input.sourceId,runId:input.runId}),stamp()); },
    alignInstant(p:ClockPrincipal, raw:z.infer<typeof instantSchema>) { const input = parse(instantSchema,raw), sync = getSync(p,{syncId:input.syncId,sourceId:input.sourceId,runId:input.runId}), receivedAtMs = stamp(); return {alignedAtMs:aligned(input.sourceAtMs,sync,receivedAtMs),receivedAtMs,uncertaintyMs:sync.uncertaintyMs}; },
    alignBindingBatch(p:ClockPrincipal, raw:BindingBatch):{input:BindingBatch;alignedAtMs:number;receivedAtMs:number;uncertaintyMs:number;bindings:Binding[]} {
      const input = parse(bindingBatchSchema,raw), sync = getSync(p,{syncId:input.syncId,sourceId:input.sourceId,runId:input.runId}), receivedAtMs = stamp();
      const alignedAtMs = aligned(input.sourceAtMs,sync,receivedAtMs);
      const bindings = input.bindings.map(b => {
        if (b.observedLocation && b.observedLocation.sourceObservedAtMs < b.sourceSinceAtMs) fail('CLOCK_INTERVAL_INVALID', 'Location predates binding');
        const {sourceSinceAtMs,sourceLastVerifiedAtMs,observedLocation,...rest} = b;
        return {...rest,sourceId:input.sourceId,runId:input.runId,sinceMs:aligned(sourceSinceAtMs,sync,receivedAtMs),lastVerifiedAtMs:aligned(sourceLastVerifiedAtMs,sync,receivedAtMs),observedLocation:observedLocation ? {label:observedLocation.label,observedAtMs:aligned(observedLocation.sourceObservedAtMs,sync,receivedAtMs)} : null};
      });
      return {input,alignedAtMs,receivedAtMs,uncertaintyMs:sync.uncertaintyMs,bindings};
    },
    freezeCapture(p:ClockPrincipal, raw:{captureId:ID;visitId:ID;sourceId:ID;runId:ID}):FrozenCaptureClock {
      const input = parse(z.strictObject({...sourceShape,captureId:idSchema,visitId:idSchema}),raw);
      if (!['ppg','patient'].includes(p.role) || p.visitId !== input.visitId) fail('CLOCK_SCOPE_MISMATCH', 'Capture requires the paired PPG visit', 403);
      const sync = getLatestSync(p,{sourceId:input.sourceId,runId:input.runId}), startedAtMs = stamp();
      const frozen = Object.freeze({...input,syncId:sync.id,startedAtMs,expiresAtMs:startedAtMs+600000});
      captures.set(frozen,{principal:{...p},frozen,sync}); return frozen;
    },
    alignCaptureInterval(p:ClockPrincipal, frozen:FrozenCaptureClock, raw:z.infer<typeof intervalSchema>):AlignedInterval {
      const input = parse(intervalSchema,raw), record = captures.get(frozen);
      if (!record) return fail('CLOCK_SCOPE_MISMATCH', 'Unknown frozen capture', 403);
      samePrincipal(p,record.principal);
      if (input.syncId !== frozen.syncId || input.sourceId !== frozen.sourceId || input.runId !== frozen.runId) fail('CLOCK_SCOPE_MISMATCH', 'Capture mapping differs', 403);
      const receivedAtMs = stamp();
      if (receivedAtMs > frozen.expiresAtMs) fail('CLOCK_CAPTURE_EXPIRED', 'Capture expired', 409);
      const result = interval(input,record.sync,receivedAtMs), u = record.sync.uncertaintyMs;
      if (result.alignedStartAtMs < frozen.startedAtMs-u || result.alignedEndAtMs > frozen.startedAtMs+60000+u) fail('CLOCK_CAPTURE_INTERVAL', 'Measurement falls outside capture');
      return result;
    },
    dispose() { handshakes.clear(); syncs.clear(); latest.clear(); captures.clear(); },
  };
}
export type ClockService = ReturnType<typeof createClockService>;
