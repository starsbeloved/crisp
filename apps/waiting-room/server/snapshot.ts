import { randomUUID } from 'node:crypto';
import type { AlertSnapshot, Binding, CheckRequest, EvidenceFact, Measurement, Visit } from '../shared/contracts.ts';
import type { RequestCommand } from './detector.ts';

/** Event-time evidence only. Current camera context is refreshed separately by the service. */
export function buildAlertSnapshot(input:{command:RequestCommand;binding:Binding;visit:Visit;measurements:Measurement[];nowMs:number}):AlertSnapshot {
  const {command,binding,visit,nowMs}=input,id=randomUUID();
  const measurements=input.measurements.filter(m=>m.visitId===visit.id && m.alignedEndAtMs<=nowMs && (m.streamId==='phone' || m.trackId===binding.trackId && m.identityEpoch===binding.identityEpoch));
  const facts:EvidenceFact[]=[{id:randomUUID(),kind:'detector',text:`A seated posture change persisted for ${command.durationMs/1000} seconds.`,sourceIds:command.sourceIds,provenance:'live_camera',atMs:nowMs}];
  for(const stream of ['phone','rppg','breathing'] as const){
    const m=measurements.filter(row=>row.streamId===stream).at(-1);
    const label=stream==='phone'?'Contact pulse':stream==='rppg'?'Camera pulse':'Camera breathing';
    const usable=m?.quality==='usable' && m.value!==null && (stream==='phone' || nowMs-m.alignedEndAtMs<=5000);
    facts.push(usable ? {id:randomUUID(),kind:'measurement',text:`${label}: ${m.value} ${m.unit}; recorded interval ${m.alignedStartAtMs}–${m.alignedEndAtMs} service ms.`,sourceIds:[m.id],provenance:m.provenance,atMs:m.alignedEndAtMs}
      : {id:randomUUID(),kind:'missing',text:`${label} has no usable ${stream==='phone'?'check-in':'current'} estimate.`,sourceIds:m?[m.id]:[],provenance:m?.provenance??null,atMs:nowMs});
  }
  if(visit.answers)facts.push({id:randomUUID(),kind:'reported',text:visit.answers.reason,sourceIds:[visit.id],provenance:null,atMs:visit.createdAtMs});
  const event:CheckRequest={id,visitId:visit.id,trackId:binding.trackId,identityEpoch:binding.identityEpoch,state:'open',createdAtMs:nowMs,updatedAtMs:nowMs,snapshotVersion:1,reason:'sustained-seated-posture-change',durationMs:command.durationMs,location:binding.observedLocation?.label??null,facts};
  return structuredClone({eventId:id,version:1,event,binding,visit,measurements,facts});
}

/** Heartbeat and box jitter must not invalidate an otherwise stable provider job. */
export function requestContextKey(binding:Binding|null):string {
  return binding ? JSON.stringify([binding.sourceId,binding.runId,binding.trackId,binding.visitId,binding.identityEpoch,binding.state,binding.observedLocation?.label??null]) : 'unverified';
}
