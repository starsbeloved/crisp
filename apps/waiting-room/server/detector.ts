import type { PoseObservation } from '../shared/contracts.ts';
export type DetectorState = { key?:string; lastAtMs?:number; referenceSinceMs?:number|null; armed?:boolean; candidateSinceMs?:number|null; candidateSourceIds?:string[]; openRequestId?:string|null };
export type RequestCommand = {visitId:string;trackId:string;identityEpoch:string;startedAtMs:number;durationMs:number;sourceIds:string[]};
export type DetectorResult = {state:DetectorState;request:RequestCommand|null};
function reset(state:DetectorState):DetectorState {
  return {...state,armed:false,referenceSinceMs:null,candidateSinceMs:null,candidateSourceIds:[]};
}
export function expirePosture(state:DetectorState, nowMs:number):DetectorState {
  return state.lastAtMs !== undefined && nowMs-state.lastAtMs>1000 ? reset(state) : {...state};
}
export function reducePosture(previous:DetectorState, observation:PoseObservation, nowMs:number):DetectorResult {
  const p=observation, at=p.alignedAtMs;
  const key=JSON.stringify([p.sourceId,p.runId,p.trackId,p.visitId,p.identityEpoch,p.referenceGeneration]);
  let state=previous.key===key ? expirePosture(previous,nowMs) : reset({key});
  if(state.lastAtMs!==undefined && at<=state.lastAtMs)return {state,request:null};
  if(state.lastAtMs!==undefined && at-state.lastAtMs>1000)state=reset(state);
  state={...state,lastAtMs:at};
  const usable=p.provenance==='live_camera' && p.quality==='usable' && p.activity==='stationary' && p.seated===true && p.visitId!==null && p.referenceGeneration>0 && nowMs-at<=1000 && at<=nowMs;
  if(!usable || (p.qualifyingSlump && !p.referenceReady))return {state:reset(state),request:null};
  if(state.openRequestId)return {state,request:null};
  if(state.armed && !p.referenceReady)state=reset(state);
  if(!p.qualifyingSlump){
    const referenceSinceMs=state.referenceSinceMs ?? at;
    return {state:{...state,referenceSinceMs,armed:p.referenceReady && at-referenceSinceMs>=10000,candidateSinceMs:null,candidateSourceIds:[]},request:null};
  }
  if(!state.armed)return {state:reset(state),request:null};
  const candidateSinceMs=state.candidateSinceMs ?? at;
  const candidateSourceIds=[...(state.candidateSourceIds??[]),p.id];
  state={...state,candidateSinceMs,candidateSourceIds};
  if(at-candidateSinceMs<10000)return {state,request:null};
  return {state:{...state,openRequestId:'pending'},request:{visitId:p.visitId!,trackId:p.trackId,identityEpoch:p.identityEpoch,startedAtMs:candidateSinceMs,durationMs:at-candidateSinceMs,sourceIds:candidateSourceIds}};
}
