import type { ClockSync } from '../../shared/contracts.ts';
import { createSourceClock } from './clock.ts';
import { api } from './api.ts';

/** Source time never changes. Compatible periodic mappings share a continuity key;
 * emitted packets still carry the actual current mapping ID, never that key.
 */
export function createSensorClock(options:Parameters<typeof createSourceClock>[0]) {
  const mappings=new Map<string,ClockSync>();let latest:ClockSync|null=null,generation=0,lost=false;
  const transport=options.transport??{start:api.startClockSync,complete:api.completeClockSync};
  const clock=createSourceClock({...options,transport:{start:transport.start,complete:async input=>{
    const value=await transport.complete(input);
    if(value.sourceId!==options.sourceId||value.runId!==options.runId)throw Error('Clock scope mismatch');
    if(!latest||lost||Math.abs(value.offsetMs-latest.offsetMs)>value.uncertaintyMs+latest.uncertaintyMs)generation++;
    latest={...value};lost=false;mappings.set(value.id,{...value});
    for(const [id,mapping] of mappings)if(value.expiresAtMs-mapping.expiresAtMs>120000)mappings.delete(id);
    return value;
  }}});
  return {...clock,
    getContinuityKey(){if(!clock.getSyncId()){lost=true;return null;}return `${options.runId}_${generation}`;},
    mapping(id:string){const value=mappings.get(id);return value?{...value}:null;},
    dispose(){clock.dispose();mappings.clear();latest=null;lost=true;},
  };
}
export type SensorClock=ReturnType<typeof createSensorClock>;
