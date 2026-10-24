import { describe, expect, it } from 'vitest';
import { calibrateSimilarity, createFaceGallery, createEnrollmentSession, createIdentityTracker } from '../client/vision/identity.ts';
import type { FaceDetection } from '../client/vision/types.ts';
const similarity = (a:readonly number[], b:readonly number[]) => 1 - Math.abs(a[0]-b[0]);
const face = (value:number,x=.1):FaceDetection => ({bounds:{x,y:.2,width:.18,height:.3},descriptor:[value,1],usable:true,reason:null});
const calibration = {modelId:'test',threshold:.75,margin:.1};
function gallery() {
  const g = createFaceGallery();
  g.enroll({visitId:'alice',modelId:'test',samples:[[0,1],[.01,1],[0,1]],capturedAtMs:0});
  g.enroll({visitId:'bob',modelId:'test',samples:[[1,1],[.99,1],[1,1]],capturedAtMs:0});
  return g;
}
function setup() {
  const tracker = createIdentityTracker({gallery:gallery(),modelId:'test',similarity,calibration});
  let seq=0;
  const update=(faces:FaceDetection[],t=seq*200,runId='run')=>tracker.update({runId,seq:++seq,sourceAtMs:t},faces,t)!;
  const settle=(faces:FaceDetection[])=>{update(faces);update(faces);return update(faces);};
  return {tracker,update,settle};
}
describe('enrollment and calibration',()=>{
  it('requires three distinct usable one-face captures, rejects reuse, and copies descriptors',()=>{
    const session=createEnrollmentSession('alice','test');
    expect(session.finish()).toBeNull();
    expect(session.add({runId:'r',seq:1,sourceAtMs:0},[face(0),face(1)])).toMatchObject({accepted:false});
    expect(session.add({runId:'r',seq:2,sourceAtMs:200},[{...face(0),usable:false}])).toMatchObject({accepted:false});
    const detection=face(0);
    expect(session.add({runId:'r',seq:3,sourceAtMs:400},[detection])).toMatchObject({accepted:true,count:1});
    detection.descriptor[0]=100;
    expect(session.add({runId:'r',seq:3,sourceAtMs:400},[face(0)])).toMatchObject({accepted:false,count:1});
    session.add({runId:'r',seq:4,sourceAtMs:600},[face(0)]);
    session.add({runId:'r',seq:5,sourceAtMs:800},[face(0)]);
    expect(session.finish()).toMatchObject({visitId:'alice',samples:[[0,1],[0,1],[0,1]],capturedAtMs:800});
  });
  it('rejects invalid vectors, mixed dimensions and camera restarts during enrollment',()=>{
    const session=createEnrollmentSession('alice','test');
    session.add({runId:'one',seq:1,sourceAtMs:0},[face(0)]);
    expect(session.add({runId:'one',seq:2,sourceAtMs:200},[{...face(0),descriptor:[NaN]}]).accepted).toBe(false);
    expect(session.add({runId:'one',seq:3,sourceAtMs:400},[{...face(0),descriptor:[1,2,3]}]).accepted).toBe(false);
    expect(session.add({runId:'two',seq:1,sourceAtMs:600},[face(0)])).toMatchObject({count:1});
  });
  it('fails calibration when genuine and unknown distributions overlap or samples are missing',()=>{
    expect(calibrateSimilarity('test',[.9,.85],[.4,.5])).toEqual({modelId:'test',threshold:.675,margin:.1});
    expect(calibrateSimilarity('test',[.7],[.65])).toBeNull();
    expect(calibrateSimilarity('test',[],[.1])).toBeNull();
    expect(calibrateSimilarity('test',[NaN],[.1])).toBeNull();
  });
});
describe('conservative association',()=>{
  it('requires three confirmations, rejects unknowns and does not use seat positions as identity',()=>{
    const {update}=setup();
    expect(update([face(0)])[0]).toMatchObject({state:'uncertain',visitId:null});
    update([face(0)]);
    expect(update([face(0)])[0]).toMatchObject({state:'matched',visitId:'alice'});
    expect(update([face(.5)])[0].visitId).toBeNull();
    expect(update([face(.5)])[0].state).toBe('unknown');
  });
  it('keeps both enrolled people correct after a seat swap with fresh epochs and reconfirmation',()=>{
    const {settle}=setup();
    const before=settle([face(0,.1),face(1,.7)]);
    const after=settle([face(1,.1),face(0,.7)]);
    expect(after.map(b=>b.visitId)).toEqual(['bob','alice']);
    expect(after[0].identityEpoch).not.toBe(before[1].identityEpoch);
    expect(after[1].identityEpoch).not.toBe(before[0].identityEpoch);
  });
  it('invalidates crossing, duplicate candidates and near-tie descriptors instead of picking a winner',()=>{
    const {update,settle}=setup();
    settle([face(0,.1),face(1,.7)]);
    expect(update([face(0,.4),face(1,.41)]).every(b=>b.visitId===null)).toBe(true);
    expect(settle([face(0,.1),face(0,.7)]).every(b=>b.state==='uncertain' && b.visitId===null)).toBe(true);
    const g=createFaceGallery();
    g.enroll({visitId:'a',modelId:'test',samples:[[0,1],[0,1],[0,1]],capturedAtMs:0});
    g.enroll({visitId:'b',modelId:'test',samples:[[.05,1],[.05,1],[.05,1]],capturedAtMs:0});
    const tracker=createIdentityTracker({gallery:g,modelId:'test',similarity,calibration});
    expect(tracker.update({runId:'r',seq:1,sourceAtMs:0},[face(0)],0)![0]).toMatchObject({visitId:null,state:'uncertain'});
  });
  it('resets after absence, unusable evidence, a gap, source restart and explicit invalidation',()=>{
    const {update,settle,tracker}=setup();
    const before=settle([face(0)])[0];
    expect(update([])).toEqual([]);
    const reappeared=settle([face(0)])[0];
    expect(reappeared.identityEpoch).not.toBe(before.identityEpoch);
    expect(update([{...face(0),usable:false}])[0]).toMatchObject({state:'uncertain',visitId:null});
    settle([face(0)]);
    expect(update([face(0)],10000)[0].visitId).toBeNull();
    expect(update([face(0)],10200,'new-run')[0].visitId).toBeNull();
    tracker.reset();
    expect(update([face(0)],10400,'new-run')[0].visitId).toBeNull();
  });
  it('rejects expired, future and out-of-order inference results',()=>{
    const {tracker}=setup();
    expect(tracker.update({runId:'r',seq:1,sourceAtMs:0},[face(0)],501)).toBeNull();
    expect(tracker.update({runId:'r',seq:2,sourceAtMs:1000},[face(0)],999)).toBeNull();
    tracker.update({runId:'r',seq:3,sourceAtMs:1000},[face(0)],1000);
    expect(tracker.update({runId:'r',seq:2,sourceAtMs:900},[face(0)],1000)).toBeNull();
  });
  it('does not falsely reject the exact conservative threshold and margin boundaries',()=>{
    const g=createFaceGallery();g.enroll({visitId:'a',modelId:'test',samples:[[0,1],[0,1],[0,1]],capturedAtMs:0});
    const tracker=createIdentityTracker({gallery:g,modelId:'test',similarity,calibration});
    for(let seq=1;seq<=2;seq++)tracker.update({runId:'r',seq,sourceAtMs:seq*200},[face(.25)],seq*200);
    expect(tracker.update({runId:'r',seq:3,sourceAtMs:600},[face(.25)],600)![0].visitId).toBe('a');
  });
  it('stays unassigned without matching model-specific calibration',()=>{
    const tracker=createIdentityTracker({gallery:gallery(),modelId:'test',similarity,calibration:null});
    for(let seq=1;seq<=4;seq++)expect(tracker.update({runId:'r',seq,sourceAtMs:seq},[face(0)],seq)![0].visitId).toBeNull();
  });
});

it('rejects enrollment samples inconsistent with the first captured face',()=>{
  const session=createEnrollmentSession('a','test',{similarity,threshold:.75});
  session.add({runId:'r',seq:1,sourceAtMs:0},[face(0)]);
  expect(session.add({runId:'r',seq:2,sourceAtMs:200},[face(1)])).toMatchObject({accepted:false,count:1});
  expect(session.finish()).toBeNull();
});
it('never uses a stale source frame as current metadata even when completion is recent',()=>{
  const {tracker}=setup();
  tracker.update({runId:'r',seq:1,sourceAtMs:0},[face(0)],0);
  expect(tracker.update({runId:'r',seq:2,sourceAtMs:0},[face(0)],1)).toBeNull();
});
