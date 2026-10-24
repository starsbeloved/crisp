import type { ClockComplete, ClockHandshake, ClockStart, ClockSync, ID } from '../../shared/contracts.ts';
import { clockHandshakeSchema, clockSyncSchema } from '../../shared/schemas.ts';
import { api } from './api.ts';
export function createSourceClock({sourceId,runId,wallNow=Date.now,monotonicNow=()=>performance.now(),transport={start:api.startClockSync,complete:api.completeClockSync},onError}:{sourceId:ID;runId:ID;wallNow?:()=>number;monotonicNow?:()=>number;transport?:{start:(input:ClockStart)=>Promise<ClockHandshake>;complete:(input:ClockComplete)=>Promise<ClockSync>};onError?:(error:unknown)=>void}) {
  const wallAnchor=wallNow(), monoAnchor=monotonicNow();
  let lastMono=monoAnchor, ended:Error|null=null, disposed=false, sync:ClockSync|null=null;
  let pending:Promise<ClockSync>|null=null, timer:ReturnType<typeof setTimeout>|undefined;
  function end(error:Error):never { ended=error; sync=null; clearTimeout(timer); throw error; }
  function nowMs() {
    if(disposed) throw new Error('Source clock disposed');
    if(ended) throw ended;
    const mono=monotonicNow(), source=wallAnchor+mono-monoAnchor, wall=wallNow();
    // A >1s wall/monotonic disagreement ends continuity; never retimestamp samples.
    if(![mono,source,wall].every(Number.isFinite) || source<0 || mono<lastMono || Math.abs(wall-source)>1000) return end(new Error('Source clock changed; start a new run'));
    lastMono=mono; return source;
  }
  function getSyncId():ID|null {
    if(disposed || ended || !sync) return null;
    try { if(nowMs()+sync.offsetMs>sync.expiresAtMs) sync=null; } catch { return null; }
    return sync?.id??null;
  }
  function schedule() {
    clearTimeout(timer);
    if(!disposed && !ended) timer=setTimeout(()=>{void synchronize().catch(error=>onError?.(error));},30000);
  }
  function synchronize():Promise<ClockSync> {
    if(pending) return pending;
    let clientSendMs:number;
    try {clientSendMs=nowMs();} catch(error) {return Promise.reject(error);}
    pending=Promise.resolve().then(async()=>{
      try {
        const handshake=clockHandshakeSchema.parse(await transport.start({phase:'start',sourceId,runId,clientSendMs}));
        const clientReceiveMs=nowMs();
        if(clientReceiveMs-clientSendMs>1000 || handshake.serverSendMs-handshake.serverReceiveMs>clientReceiveMs-clientSendMs) throw new Error('Clock round trip is invalid');
        const next=clockSyncSchema.parse(await transport.complete({phase:'complete',handshakeId:handshake.handshakeId,clientReceiveMs}));
        const sourceNow=nowMs();
        if(next.sourceId!==sourceId || next.runId!==runId || sourceNow+next.offsetMs>next.expiresAtMs) throw new Error('Clock mapping is mismatched or expired');
        sync={...next}; return {...next};
      } catch(error) {sync=null; throw error;}
      finally {pending=null;schedule();}
    });
    return pending;
  }
  return {nowMs,synchronize,getSyncId,dispose(){disposed=true;sync=null;clearTimeout(timer);}};
}
