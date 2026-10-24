import { expect, it } from 'vitest';
import { createSensorClock } from '../client/runtime/sensor-clock.ts';
import type { ClockSync } from '../shared/contracts.ts';

it('refreshes overlapping mappings without discarding 45-second same-run continuity', async()=>{
  let time=100000,sequence=0;
  const clock=createSensorClock({sourceId:'camera',runId:'run',wallNow:()=>time,monotonicNow:()=>time,transport:{start:async()=>({handshakeId:'handshake',serverReceiveMs:time,serverSendMs:time}),complete:async()=>({id:`sync_${++sequence}`,sourceId:'camera',runId:'run',offsetMs:90,uncertaintyMs:5,expiresAtMs:time+60000})}});
  await clock.synchronize();const key=clock.getContinuityKey();time+=30000;await clock.synchronize();
  expect(clock.getSyncId()).toBe('sync_2');expect(clock.getContinuityKey()).toBe(key);expect(clock.mapping('sync_1')?.offsetMs).toBe(90);
  time+=16000;expect(clock.getContinuityKey()).toBe(key);clock.dispose();
});
it('changes continuity for disjoint clock mappings and expires all producer authority honestly',async()=>{
  let time=100000,offset=0,seq=0;
  const clock=createSensorClock({sourceId:'camera',runId:'run',wallNow:()=>time,monotonicNow:()=>time,transport:{start:async()=>({handshakeId:'handshake',serverReceiveMs:time,serverSendMs:time}),complete:async()=>({id:`sync_${++seq}`,sourceId:'camera',runId:'run',offsetMs:offset,uncertaintyMs:2,expiresAtMs:time+60000})}});
  await clock.synchronize();const key=clock.getContinuityKey();offset=30;await clock.synchronize();expect(clock.getContinuityKey()).not.toBe(key);
  time+=61000;expect(clock.getSyncId()).toBeNull();expect(clock.getContinuityKey()).toBeNull();clock.dispose();
});
