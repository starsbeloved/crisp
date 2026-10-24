import type { Binding, BindingBatch, CheckRequest, Measurement, PoseObservation, ReferenceControl, RoomSnapshot } from '../shared/contracts.ts';
import { bindingBatchSchema, ingestSchema } from '../shared/schemas.ts';
import type { ClockPrincipal, ClockService } from './clock.ts';
import { canonical, parse, StoreError, type WaitingRoomStore } from './store.ts';
import { expirePosture, reducePosture, type DetectorState } from './detector.ts';
import { buildAlertSnapshot, requestContextKey } from './snapshot.ts';

type MeasurementInput=Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>;
type PoseInput=Omit<PoseObservation,'alignedAtMs'|'receivedAtMs'>;
type Ordered={id:string;sourceId:string;runId:string;streamId:string;seq:number};
type Counts={accepted:number;duplicates:number;rejected:number};
type Segment={binding:Binding;sourceSinceAtMs:number;start:number;end:number;closed:boolean;closedAt:number|null;uncertaintyMs:number};
const key=(...parts:unknown[])=>JSON.stringify(parts);
const trackKey=(b:{sourceId:string;runId:string;trackId:string})=>key(b.sourceId,b.runId,b.trackId);
const epochKey=(b:{sourceId:string;runId:string;trackId:string;identityEpoch:string})=>key(b.sourceId,b.runId,b.trackId,b.identityEpoch);
const controlKey=(b:{trackId:string;visitId:string|null;identityEpoch:string})=>key(b.trackId,b.visitId,b.identityEpoch);
const empty=():Counts=>({accepted:0,duplicates:0,rejected:0});
const forbidden=()=>{throw new StoreError(403,'STATION_REQUIRED','Station authority required for room sensing');};

export function createIngestService({store,clocks,now=Date.now}: {store:WaitingRoomStore;clocks:ClockService;now?:()=>number}) {
  const current=new Map<string,Segment>(),segments:Segment[]=[],epochs=new Set<string>();
  const activeRuns=new Map<string,string>(),retiredRuns=new Set<string>();
  const sourceBatchAt=new Map<string,number>();
  const order=new Map<string,{seq:number;at:number}>();
  const seen=new Map<string,{body:string;at:number}>();
  const controls=new Map<string,ReferenceControl>(),detectors=new Map<string,DetectorState>();
  const boundaries=new Map<string,number>(),controlSince=new Map<string,number>();
  let measurements:Measurement[]=[],poses:PoseObservation[]=[],revision=0,lastBatchAt:number|null=null;
  function station(p:ClockPrincipal){if(p.role!=='station' || p.visitId!==null)forbidden();}
  function duplicate(row:Ordered):boolean {
    const body=canonical(row),id=seen.get(key('id',row.id)),seq=seen.get(key('seq',row.sourceId,row.runId,row.streamId,row.seq));
    if(id || seq){
      if(id?.body!==body || seq?.body!==body)throw new StoreError(409,'OBSERVATION_CONFLICT','Observation ID or stream sequence was reused with different content');
      return true;
    }
    return false;
  }
  function ordered(row:Ordered,at:number):boolean {
    const prior=order.get(key(row.sourceId,row.runId,row.streamId));
    return !retiredRuns.has(key(row.sourceId,row.runId)) && (!prior || row.seq>prior.seq && at>=prior.at);
  }
  function remember(row:Ordered,at:number){
    const entry={body:canonical(row),at:now()};
    seen.set(key('id',row.id),entry);seen.set(key('seq',row.sourceId,row.runId,row.streamId,row.seq),entry);
    order.set(key(row.sourceId,row.runId,row.streamId),{seq:row.seq,at});
  }
  function close(segment:Segment,at:number,uncertaintyMs=0){
    if(segment.closed)return;
    segment.end=Math.min(segment.end,at-uncertaintyMs);segment.closed=true;segment.closedAt=at-uncertaintyMs;
    const id=key(segment.binding.sourceId,segment.binding.trackId);boundaries.set(id,Math.max(boundaries.get(id)??0,at));
    detectors.delete(trackKey(segment.binding));revision++;
  }
  function liveBinding(segment:Segment):Binding|null {
    const b=segment.binding,t=now();
    if(segment.closed || t<b.lastVerifiedAtMs || t-b.lastVerifiedAtMs>1000)return null;
    return {...b,observedLocation:b.observedLocation && t>=b.observedLocation.observedAtMs && t-b.observedLocation.observedAtMs<=1000?b.observedLocation:null};
  }
  function refreshRequests(){
    for(const request of store.getRoomSnapshot().requests){
      if(request.state==='checked')continue;
      const visible=[...current.values()].map(liveBinding).filter((b):b is Binding=>b!==null);
      const identified=visible.filter(b=>b.state==='matched' && b.visitId===request.visitId);
      const candidate=identified.length===1?identified[0]:visible.find(b=>b.trackId===request.trackId)??null;
      const bound=candidate?.state==='matched' && candidate.visitId===request.visitId?candidate:null;
      store.refreshRequestContext(request.id,bound,requestContextKey(candidate));
    }
  }
  function tick(){
    const cutoff=now()-600000;
    measurements=measurements.filter(m=>m.alignedEndAtMs>=cutoff);poses=poses.filter(p=>p.alignedAtMs>=cutoff);
    for(const segment of current.values())if(!segment.closed && now()-segment.binding.lastVerifiedAtMs>1000)close(segment,segment.binding.lastVerifiedAtMs+1000);
    for(const [id,state] of detectors)detectors.set(id,expirePosture(state,now()));
    for(let i=segments.length-1;i>=0;i--)if(segments[i].closed && segments[i].end<cutoff)segments.splice(i,1);
    for(const [id,entry] of seen)if(entry.at<cutoff)seen.delete(id);
    refreshRequests();
  }
  function associated(row:MeasurementInput|PoseInput,start:number,end:number,uncertaintyMs:number):Segment|undefined {
    if(!row.visitId || start<now()-600000 || end>now())return undefined;
    return segments.find(segment=>{
      const b=segment.binding;
      return b.state==='matched' && b.sourceId===row.sourceId && b.runId===row.runId && b.trackId===row.trackId && b.visitId===row.visitId && b.identityEpoch===row.identityEpoch && start-uncertaintyMs>=segment.start && end+uncertaintyMs<=segment.end && (segment.closedAt===null || end+uncertaintyMs<segment.closedAt);
    });
  }
  function controlFor(b:Binding){
    if(b.state!=='matched' || !b.visitId)return null;
    const id=controlKey(b);let control=controls.get(id);
    if(!control){control={trackId:b.trackId,visitId:b.visitId,identityEpoch:b.identityEpoch,generation:1};controls.set(id,control);}
    return control;
  }
  function updateBindings(p:ClockPrincipal,raw:unknown):Counts {
    station(p);const input=parse(bindingBatchSchema,raw);tick();
    if(duplicate(input))return {accepted:0,duplicates:1,rejected:0};
    const aligned=clocks.alignBindingBatch(p,input),{bindings,alignedAtMs,uncertaintyMs}=aligned;
    const reject=()=>({accepted:0,duplicates:0,rejected:Math.max(bindings.length,1)});
    if(!ordered(input,input.sourceAtMs) || alignedAtMs<now()-600000 || alignedAtMs>now())return reject();
    const oldRun=activeRuns.get(input.sourceId);
    const tracks=new Set<string>(),visits=new Set<string>();
    for(const b of bindings){
      if(tracks.has(b.trackId) || b.visitId && visits.has(b.visitId))return reject();
      tracks.add(b.trackId);if(b.visitId){visits.add(b.visitId);try{store.getVisit(b.visitId);}catch{return reject();}}
      const prior=current.get(trackKey(b));
      const original=input.bindings.find(row=>row.trackId===b.trackId)!;
      const boundary=boundaries.get(key(b.sourceId,b.trackId))??0;
      if(oldRun && oldRun!==input.runId && b.sinceMs<(sourceBatchAt.get(input.sourceId)??0))return reject();
      if((!prior || prior.closed || prior.binding.identityEpoch!==b.identityEpoch) && b.sinceMs<Math.max(boundary,prior?.binding.lastVerifiedAtMs??0))return reject();
      if(epochs.has(epochKey(b)) && (!prior || prior.closed || prior.binding.identityEpoch!==b.identityEpoch))return reject();
      if(prior && !prior.closed && prior.binding.identityEpoch===b.identityEpoch && (b.visitId!==prior.binding.visitId || b.state!==prior.binding.state || original.sourceSinceAtMs!==prior.sourceSinceAtMs || b.lastVerifiedAtMs<prior.binding.lastVerifiedAtMs))return reject();
      if(b.visitId && [...current.values()].some(s=>!s.closed && s.binding.sourceId!==input.sourceId && s.binding.visitId===b.visitId))return reject();
    }
    if(oldRun && oldRun!==input.runId){
      retiredRuns.add(key(input.sourceId,oldRun));
      const transitionAt=Math.min(alignedAtMs,...bindings.map(b=>b.sinceMs));
      for(const s of current.values())if(s.binding.sourceId===input.sourceId){close(s,transitionAt,uncertaintyMs);current.delete(trackKey(s.binding));}
    }
    activeRuns.set(input.sourceId,input.runId);
    for(const s of current.values())if(s.binding.sourceId===input.sourceId && s.binding.runId===input.runId && !tracks.has(s.binding.trackId)){close(s,alignedAtMs,uncertaintyMs);current.delete(trackKey(s.binding));}
    for(const b of bindings){
      const id=trackKey(b),prior=current.get(id);
      if(prior && !prior.closed && prior.binding.identityEpoch===b.identityEpoch){prior.binding={...b,sinceMs:prior.binding.sinceMs};prior.start=Math.max(prior.start,b.sinceMs+uncertaintyMs);prior.end=b.lastVerifiedAtMs-uncertaintyMs;}
      else {
        if(prior)close(prior,b.sinceMs,uncertaintyMs);
        const segment:Segment={binding:b,sourceSinceAtMs:input.bindings.find(row=>row.trackId===b.trackId)!.sourceSinceAtMs,start:b.sinceMs+uncertaintyMs,end:b.lastVerifiedAtMs-uncertaintyMs,closed:false,closedAt:null,uncertaintyMs};
        segments.push(segment);current.set(id,segment);epochs.add(epochKey(b));detectors.delete(id);
      }
      controlFor(b);
    }
    remember(input,input.sourceAtMs);sourceBatchAt.set(input.sourceId,alignedAtMs);lastBatchAt=alignedAtMs;revision++;refreshRequests();
    return {accepted:bindings.length,duplicates:0,rejected:0};
  }
  function ingestObservations(p:ClockPrincipal,raw:unknown):Counts {
    station(p);
    const parsed=ingestSchema.safeParse(raw);
    if(!parsed.success && parsed.error.issues.some(issue=>issue.code==='custom' && issue.message==='Conflicting observation reuse'))throw new StoreError(409,'OBSERVATION_CONFLICT','Observation ID or sequence conflicts within the batch');
    const input=parsed.success?parsed.data:parse(ingestSchema,raw);tick();const counts=empty();
    // Preflight conflicts and clocks before applying any row in a batch.
    const rows=[...input.measurements,...input.poses];
    const prepared=rows.map(row=>{
      if(duplicate(row))return {row,duplicate:true as const};
      if(row.streamId==='phone')throw new StoreError(400,'INVALID_MEASUREMENT','Phone measurements require their paired capture route');
      const alignment=row.streamId==='pose' ? clocks.alignInstant(p,{sourceId:row.sourceId,runId:row.runId,syncId:row.syncId,sourceAtMs:row.sourceAtMs})
        : clocks.alignInterval(p,{sourceId:row.sourceId,runId:row.runId,syncId:row.syncId,sourceStartAtMs:row.sourceStartAtMs,sourceEndAtMs:row.sourceEndAtMs});
      return {row,duplicate:false as const,alignment};
    });
    for(const item of prepared){
      const {row}=item;
      if(item.duplicate || duplicate(row)){counts.duplicates++;continue;}
      const sourceAt=row.streamId==='pose'?row.sourceAtMs:row.sourceEndAtMs;
      if(!ordered(row,sourceAt)){counts.rejected++;continue;}
      if(row.streamId==='pose'){
        const a=item.alignment as ReturnType<ClockService['alignInstant']>;
        const segment=associated(row,a.alignedAtMs,a.alignedAtMs,a.uncertaintyMs),control=segment?controlFor(segment.binding):null;
        if(!segment || !control || row.referenceGeneration!==control.generation || a.alignedAtMs-a.uncertaintyMs<(controlSince.get(controlKey(control))??0)){counts.rejected++;continue;}
        const observation:PoseObservation={...row,alignedAtMs:a.alignedAtMs,receivedAtMs:a.receivedAtMs};poses.push(observation);
        const id=trackKey(segment.binding),currentBinding=liveBinding(segment);
        const open=store.getRoomSnapshot().requests.find(r=>r.visitId===row.visitId && r.state!=='checked');
        const result=reducePosture({...detectors.get(id),...(open?{openRequestId:open.id}:{})},observation,now());
        if(currentBinding && result.request && !open){
          const snapshot=buildAlertSnapshot({command:result.request,binding:currentBinding,visit:store.getVisit(row.visitId!),measurements:[...store.getRoomSnapshot().measurements,...measurements],nowMs:now()});
          const request=store.saveCheckRequest(snapshot,requestContextKey(currentBinding));result.state.openRequestId=request.id;
        }
        detectors.set(id,result.state);
      }else{
        const a=item.alignment as ReturnType<ClockService['alignInterval']>;
        if(!associated(row,a.alignedStartAtMs,a.alignedEndAtMs,a.uncertaintyMs)){counts.rejected++;continue;}
        measurements.push({...row,alignedStartAtMs:a.alignedStartAtMs,alignedEndAtMs:a.alignedEndAtMs,receivedAtMs:a.receivedAtMs});
      }
      remember(row,sourceAt);counts.accepted++;revision++;
    }
    return counts;
  }
  function getRoomSnapshot():RoomSnapshot {
    tick();const room=store.getRoomSnapshot();
    const latest=new Map<string,PoseObservation>();for(const pose of poses)latest.set(trackKey(pose),pose);
    return {...room,revision:room.revision+revision,bindings:[...current.values()].map(s=>liveBinding(s)??{...s.binding,state:'uncertain' as const,visitId:null,observedLocation:null}),
      measurements:[...room.measurements,...structuredClone(measurements)],
      poses:[...latest.values()].filter(p=>current.has(trackKey(p))).map(p=>now()-p.alignedAtMs>1000 || !liveBinding(current.get(trackKey(p))!)?{...p,quality:'stale',activity:'unknown',seated:null,qualifyingSlump:false,referenceReady:false,reason:'No fresh eligible pose'}:structuredClone(p)),
      referenceControls:[...current.values()].filter(s=>!!liveBinding(s)).flatMap(s=>{const c=controlFor(s.binding);return c?[{...c}]:[];}),
      cameraState:lastBatchAt===null?'off':now()-lastBatchAt<=1000 && now()>=lastBatchAt?'live':'stale'};
  }
  function markChecked(id:string,requestId:string){
    tick();const event=store.buildAlertSnapshot(id).event;
    const candidates=[...current.values()].filter(s=>{const b=liveBinding(s);return b?.state==='matched' && b.visitId===event.visitId;});
    const segment=candidates.length===1?candidates[0]:undefined;
    const prior=segment?controlFor(segment.binding):null;
    const control=prior?{...prior,generation:prior.generation+(event.state==='checked'?0:1)}:null;
    const result=store.actOnRequest(id,'checked',requestId,control);
    if(event.state!=='checked' && segment && result.referenceControl){controls.set(controlKey(segment.binding),result.referenceControl);controlSince.set(controlKey(segment.binding),now());detectors.delete(trackKey(segment.binding));revision++;}
    return result;
  }
  return {updateBindings,ingestObservations,getRoomSnapshot,
    getObservationHistory(){tick();return structuredClone({measurements,poses});},
    buildAlertSnapshot(id:string){tick();return store.buildAlertSnapshot(id);},
    acknowledge(id:string,requestId:string){tick();return store.actOnRequest(id,'acknowledged',requestId,null).request;},markChecked};
}
export type IngestService=ReturnType<typeof createIngestService>;
