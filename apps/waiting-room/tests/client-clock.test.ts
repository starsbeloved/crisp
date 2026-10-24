import { afterEach, expect, it, vi } from 'vitest';
import { createSourceClock } from '../client/runtime/clock.ts';
import { createClockService } from '../server/clock.ts';
import type { ClockSync } from '../shared/contracts.ts';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  vi.useFakeTimers();
  let wall = 1000, mono = 0, server = 91000;
  const service = createClockService({now:()=>server});
  const principal = {sessionId:'private_test_session',role:'ppg' as const,visitId:'visit_1'};
  const clock = createSourceClock({sourceId:'phone_1',runId:'run_1',wallNow:()=>wall,monotonicNow:()=>mono,transport:{
    start:async input => { wall+=50; mono+=50; server+=50; const result=service.start(principal,input); wall+=50; mono+=50; server+=50; return result; },
    complete:async input => service.complete(principal,input),
  }});
  return {clock,advance:(ms:number)=>{wall+=ms;mono+=ms;server+=ms;},jump:()=>{wall+=5000;}};
}
it('uses the server handshake to align an anchored monotonic source clock and expires it', async () => {
  const {clock,advance}=setup();
  expect(clock.getSyncId()).toBeNull();
  const sync=await clock.synchronize();
  expect(sync).toMatchObject({sourceId:'phone_1',runId:'run_1',offsetMs:90000,uncertaintyMs:50});
  expect(clock.nowMs()).toBe(1100); expect(clock.getSyncId()).toBe(sync.id);
  advance(60000); expect(clock.getSyncId()).toBeNull(); clock.dispose();
});
it('deduplicates concurrent sync and renews after 30 seconds', async () => {
  const {clock,advance}=setup();
  const first=clock.synchronize(); expect(clock.synchronize()).toBe(first);
  const original=await first; advance(30000); await vi.advanceTimersByTimeAsync(30000);
  expect(clock.getSyncId()).not.toBe(original.id); expect(clock.getSyncId()).not.toBeNull(); clock.dispose();
});
it('ends a run on a wall clock jump and never reuses its mapping', async () => {
  const {clock,jump}=setup(); await clock.synchronize(); jump();
  expect(()=>clock.nowMs()).toThrow(/clock.*changed/i); expect(clock.getSyncId()).toBeNull();
  await expect(clock.synchronize()).rejects.toThrow(/clock.*changed/i); clock.dispose();
});
it('rejects a disposed in-flight sync and ignores its eventual completion', async () => {
  let release!:(value:{handshakeId:string;serverReceiveMs:number;serverSendMs:number})=>void;
  const clock=createSourceClock({sourceId:'phone_1',runId:'run_1',wallNow:()=>1000,monotonicNow:()=>0,transport:{start:()=>new Promise(resolve=>{release=resolve;}),complete:async()=>{throw Error('Must not complete after disposal');}}});
  const pending=clock.synchronize(); await Promise.resolve(); clock.dispose(); release({handshakeId:'h_1',serverReceiveMs:91000,serverSendMs:91000});
  await expect(pending).rejects.toThrow(/disposed/i); expect(clock.getSyncId()).toBeNull();
});
it('rejects mismatched, malformed or already expired service mappings', async () => {
  for (const patch of [{runId:'other_run'},{offsetMs:Infinity},{expiresAtMs:1}]) {
    const clock=createSourceClock({sourceId:'phone_1',runId:'run_1',wallNow:()=>1000,monotonicNow:()=>0,transport:{start:async()=>({handshakeId:'h_1',serverReceiveMs:91000,serverSendMs:91000}),complete:async()=>({id:'sync_1',sourceId:'phone_1',runId:'run_1',offsetMs:90000,uncertaintyMs:0,expiresAtMs:151000,...patch}) as ClockSync}});
    await expect(clock.synchronize()).rejects.toThrow(); expect(clock.getSyncId()).toBeNull(); clock.dispose();
  }
});
it('allows retry after a transport throws synchronously before the first await',async()=>{
  let attempts=0;
  const clock=createSourceClock({sourceId:'phone_1',runId:'run_1',wallNow:()=>1000,monotonicNow:()=>0,transport:{start:()=>{if(++attempts===1)throw Error('Temporary connection failure');return Promise.resolve({handshakeId:'h_1',serverReceiveMs:91000,serverSendMs:91000});},complete:async()=>({id:'sync_1',sourceId:'phone_1',runId:'run_1',offsetMs:90000,uncertaintyMs:0,expiresAtMs:151000})}});
  await expect(clock.synchronize()).rejects.toThrow('Temporary connection failure');
  expect((await clock.synchronize()).id).toBe('sync_1');clock.dispose();
});
