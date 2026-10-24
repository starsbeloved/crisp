import type { BindingBatch, ClockSync, Measurement, PoseObservation } from '../../shared/contracts.ts';
import { bindingBatchSchema, ingestSchema } from '../../shared/schemas.ts';
export type SensorMeasurement=Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>;
export type SensorPose=Omit<PoseObservation,'alignedAtMs'|'receivedAtMs'>;
export type ObservationBody={measurements:SensorMeasurement[];poses:SensorPose[]};
export type DeliveryCounts={accepted:number;duplicates:number;rejected:number};
export type DeliveryStatus={state:'idle'|'sending'|'ready'|'failed'|'stopped';reason:string|null;pending:number;accepted:number;discarded:number};
type Segment={key:string;start:number;end:number;lastBatchAt:number};
const association=(b:{trackId:string|null;visitId:string|null;identityEpoch:string|null})=>JSON.stringify([b.trackId,b.visitId,b.identityEpoch]);
/** All binding snapshots are serialized. Windows are released only AFTER the
 * server acknowledges whole-interval same-epoch coverage with clock uncertainty.
 */
export function createSensorTransport(options:{sourceId:string;runId:string;nowMs:()=>number;mapping:(id:string)=>ClockSync|null;fetch?:typeof fetch;onStatus?:(status:DeliveryStatus)=>void;onFailure?:(reason:string)=>void;onPoseRejected?:(poses:SensorPose[])=>Promise<boolean>;transport?:{bindings:(b:BindingBatch)=>Promise<DeliveryCounts>;observations:(b:ObservationBody)=>Promise<DeliveryCounts>}}){
 let disposed=false,failed=false,busy:Promise<void>|null=null,repump=false,accepted=0,discarded=0;
 let state:DeliveryStatus['state']='idle',reason:string|null=null;
 const bindings:BindingBatch[]=[],rows:(SensorMeasurement|SensorPose)[]=[],segments=new Map<string,Segment>(),controllers=new Set<AbortController>();
 const status=():DeliveryStatus=>({state,reason,pending:bindings.length+rows.length,accepted,discarded});
 const report=(s:DeliveryStatus['state'],why:string|null=null)=>{state=s;reason=why;options.onStatus?.(status());};
 const fail=(why:string)=>{if(disposed||failed)return;failed=true;bindings.length=0;rows.length=0;segments.clear();report('failed',why);options.onFailure?.(why);};
 async function request(path:string,body:unknown):Promise<DeliveryCounts>{
  const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),2000);
  try{
   const response=await (options.fetch??fetch)(`/api/wr/${path}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!response.ok)throw Error(`Sensing service rejected ${path} (${response.status}). Reconnect the station.`);
   const value:unknown=await response.json();
   if(!value||typeof value!=='object'||!['accepted','duplicates','rejected'].every(k=>Number.isSafeInteger((value as Record<string,unknown>)[k])&&Number((value as Record<string,unknown>)[k])>=0))throw Error('Invalid sensing service acknowledgement');
   return value as DeliveryCounts;
  }finally{clearTimeout(timer);controllers.delete(controller);}
 }
 const send=options.transport??{bindings:(b:BindingBatch)=>request('bindings',b),observations:(b:ObservationBody)=>request('observations',b)};
 function mapping(id:string){const m=options.mapping(id);return m&&m.sourceId===options.sourceId&&m.runId===options.runId&&options.nowMs()+m.offsetMs<=m.expiresAtMs?m:null;}
 function acknowledge(batch:BindingBatch){
  const m=mapping(batch.syncId);if(!m)throw Error('Binding clock mapping expired before acknowledgement');
  const active=new Set<string>();
  for(const b of batch.bindings){if(b.state!=='matched'||!b.visitId)continue;const key=association(b);active.add(key);
   const start=b.sourceSinceAtMs+m.offsetMs+m.uncertaintyMs,end=b.sourceLastVerifiedAtMs+m.offsetMs-m.uncertaintyMs,old=segments.get(key);
   // A local >1s gap cannot be joined even if the server accepted a late heartbeat.
   segments.set(key,{key,start:old&&batch.sourceAtMs-old.lastBatchAt<=1000?Math.max(old.start,start):start,end,lastBatchAt:batch.sourceAtMs});
  }
  for(const key of segments.keys())if(!active.has(key))segments.delete(key);
 }
 function covered(row:SensorMeasurement|SensorPose):'ready'|'wait'|'discard'{
  const m=mapping(row.syncId);if(!m)return 'discard';
  const end=row.streamId==='pose'?row.sourceAtMs:row.sourceEndAtMs,start=row.streamId==='pose'?row.sourceAtMs:row.sourceStartAtMs;
  if(options.nowMs()-end>(row.streamId==='pose'?1500:6000))return 'discard';
  const segment=segments.get(association(row));if(!segment)return 'wait';
  if(start+m.offsetMs-m.uncertaintyMs<segment.start)return 'discard';
  return end+m.offsetMs+m.uncertaintyMs<=segment.end?'ready':'wait';
 }
 async function drain(){
  while(!disposed&&!failed){
   if(bindings.length){const batch=bindings.shift()!;report('sending');const result=await send.bindings(batch);if(disposed)return;if(result.rejected)throw Error('Identity binding was rejected. Stop and reconnect before monitoring.');acknowledge(batch);accepted+=result.accepted;continue;}
   const ready:(SensorMeasurement|SensorPose)[]=[],blocked=new Set<string>();
   for(let i=0;i<rows.length;){const row=rows[i],decision=covered(row);
    if(decision==='discard'){rows.splice(i,1);discarded++;continue;}
    // Preserve per-stream order while another channel waits on its own coverage.
    if(decision==='wait'||blocked.has(row.streamId)){blocked.add(row.streamId);i++;continue;}
    if(ready.length&&ready[0].streamId!==row.streamId){i++;continue;}
    rows.splice(i,1);ready.push(row);if(ready.length===100)break;
   }
   if(!ready.length){report(accepted?'ready':'idle',reason);return;}
   const body:ObservationBody={measurements:ready.filter((r):r is SensorMeasurement=>r.streamId!=='pose'),poses:ready.filter((r):r is SensorPose=>r.streamId==='pose')};
   report('sending');const result=await send.observations(body);if(disposed)return;
   if(result.rejected){
    if(body.measurements.length===0&&body.poses.length&&await options.onPoseRejected?.(body.poses)){
     discarded+=result.rejected;accepted+=result.accepted;report('ready','Nurse reference changed; rejected old-generation poses were discarded');continue;
    }
    throw Error('Observation rejected: identity coverage or nurse reference changed. Reconnect for fresh windows.');
   }
   accepted+=result.accepted;report('ready');
  }
 }
 function pump(){if(disposed||failed)return;if(busy){repump=true;return;}repump=false;busy=Promise.resolve().then(drain).catch(e=>fail(e instanceof Error?e.message:'Sensing service transport unavailable')).finally(()=>{busy=null;if(repump)pump();});}
 function enqueue(row:SensorMeasurement|SensorPose){
  if(disposed||failed)return;
  if(row.sourceId!==options.sourceId||row.runId!==options.runId||row.provenance!=='live_camera'||!row.visitId||!row.trackId||!row.identityEpoch)return;
  const body:ObservationBody=row.streamId==='pose'?{measurements:[],poses:[row]}:{measurements:[row],poses:[]};
  if(!ingestSchema.safeParse(body).success){fail('Invalid sensor output; observation was not transmitted');return;}
  if(rows.length>=100){fail('Sensing observation delivery fell behind. Reconnect for fresh windows.');return;}
  rows.push(structuredClone(row));pump();
 }
 return {
  bindings(batch:BindingBatch){if(disposed||failed)return;if(batch.sourceId!==options.sourceId||batch.runId!==options.runId||!bindingBatchSchema.safeParse(batch).success){fail('Invalid identity binding batch');return;}
   if(bindings.length>=32){fail('Identity delivery fell behind; monitoring paused');return;}
   const active=new Set(batch.bindings.filter(b=>b.state==='matched'&&b.visitId).map(association));
   for(let i=rows.length-1;i>=0;i--)if(!active.has(association(rows[i]))){rows.splice(i,1);discarded++;}
   bindings.push(structuredClone(batch));pump();
  },
  measurement:enqueue,pose:enqueue,
  discardObservations(why:string){discarded+=rows.length;rows.length=0;if(!failed&&!disposed)report('idle',why);},
  status,
  async flush(){pump();await busy;},
  dispose(){if(disposed)return;disposed=true;controllers.forEach(c=>c.abort());controllers.clear();bindings.length=0;rows.length=0;segments.clear();report('stopped');},
 };
}
export type SensorTransport=ReturnType<typeof createSensorTransport>;
