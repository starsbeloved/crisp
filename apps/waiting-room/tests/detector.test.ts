import { expect, it } from 'vitest';
import type { PoseObservation } from '../shared/contracts.ts';
import { reducePosture, expirePosture, type DetectorState } from '../server/detector.ts';

function pose(t:number, extra:Partial<PoseObservation>={}):PoseObservation {
  return {schemaVersion:1,id:`p${t}`,sourceId:'camera',runId:'run',seq:t,syncId:'sync',streamId:'pose',referenceGeneration:1,
    sourceAtMs:t,alignedAtMs:t,receivedAtMs:t,trackId:'track',visitId:'visit',identityEpoch:'epoch',quality:'usable',provenance:'live_camera',
    activity:'stationary',seated:true,qualifyingSlump:false,referenceReady:true,reason:null,features:{},...extra};
}
function reference():DetectorState {
  let state:DetectorState={};
  for(let t=10000;t<=20000;t+=1000)state=reducePosture(state,pose(t),t).state;
  return state;
}
it('arms only after a contiguous 10 second seated reference and a ready client reference',()=>{
  let state:DetectorState={};
  for(let t=10000;t<20000;t+=1000)state=reducePosture(state,pose(t),t).state;
  expect(state.armed).not.toBe(true);
  expect(reducePosture(state,pose(19999),19999).state.armed).not.toBe(true);
  expect(reducePosture(state,pose(20000),20000).state.armed).toBe(true);
  expect(reducePosture(state,pose(20000,{referenceReady:false}),20000).state.armed).not.toBe(true);
});
it('emits once at exactly 10000ms of slump and never at 9999ms',()=>{
  let state=reference();
  for(let t=21000;t<31000;t+=1000){const result=reducePosture(state,pose(t,{qualifyingSlump:true}),t);expect(result.request).toBeNull();state=result.state;}
  const early=reducePosture(state,pose(30999,{qualifyingSlump:true}),30999);expect(early.request).toBeNull();
  const exact=reducePosture(early.state,pose(31000,{qualifyingSlump:true}),31000);
  expect(exact.request).toMatchObject({visitId:'visit',trackId:'track',identityEpoch:'epoch',durationMs:10000,startedAtMs:21000});
  expect(reducePosture(exact.state,pose(31000,{qualifyingSlump:true}),31000).request).toBeNull();
  expect(reducePosture(exact.state,pose(32000,{qualifyingSlump:true}),32000).request).toBeNull();
});
it('breaks reference and hold on a gap over one second, including service expiry with no frame',()=>{
  const state=reference();
  const candidate=reducePosture(state,pose(21000,{qualifyingSlump:true}),21000).state;
  expect(reducePosture(candidate,pose(22001,{qualifyingSlump:true}),22001).state).toMatchObject({armed:false,candidateSinceMs:null});
  expect(expirePosture(candidate,22001)).toMatchObject({armed:false,candidateSinceMs:null});
  expect(reducePosture(candidate,pose(22000,{qualifyingSlump:true}),27001).request).toBeNull();
});
it.each([
  {provenance:'synthetic'},{provenance:'replay'},{quality:'low-quality'},{quality:'collecting'},
  {activity:'moving'},{activity:'unknown'},{seated:null},{seated:false},{visitId:null},{referenceReady:false},
] as Partial<PoseObservation>[])('disqualifies %j without accumulating a live hold',extra=>{
  const result=reducePosture(reference(),pose(21000,{qualifyingSlump:true,...extra}),21000);
  expect(result.request).toBeNull();expect(result.state.armed).not.toBe(true);expect(result.state.candidateSinceMs).toBeNull();
});
it('resets across identity, source/run and generation changes and rejects repeated or reversed frame time',()=>{
  const candidate=reducePosture(reference(),pose(21000,{qualifyingSlump:true}),21000).state;
  for(const extra of [{identityEpoch:'new'},{visitId:'other'},{runId:'new'},{referenceGeneration:2}]){
    expect(reducePosture(candidate,pose(22000,{qualifyingSlump:true,...extra}),22000).state.armed).not.toBe(true);
  }
  expect(reducePosture(candidate,pose(21000,{qualifyingSlump:true}),21000).state.candidateSinceMs).toBe(21000);
  expect(reducePosture(candidate,pose(20000,{qualifyingSlump:true}),21000).request).toBeNull();
});
it('requires a new contiguous reference when an armed client loses reference readiness',()=>{
  let state=reducePosture(reference(),pose(21000,{referenceReady:false}),21000).state;
  expect(state.armed).not.toBe(true);
  state=reducePosture(state,pose(22000),22000).state;expect(state.armed).not.toBe(true);
  for(let t=23000;t<=31000;t+=1000)state=reducePosture(state,pose(t),t).state;
  expect(state.armed).toBe(true);
});
