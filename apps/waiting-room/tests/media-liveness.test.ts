import { describe, expect, it } from 'vitest';
import { createFrameLiveness } from '../client/media/liveness.ts';
import { cameraOverlays } from '../client/media/overlays.ts';
import { emptyRoom } from '../shared/fixtures.ts';
import type { Binding, RoomSnapshot } from '../shared/contracts.ts';

describe('receiver presentation liveness',()=>{
  it('never treats connection or media playback time as a fresh decoded frame',()=>{
    const l=createFrameLiveness();expect(l.read(100).phase).toBe('waiting');
    expect(l.frame(0,100)).toBe(false);expect(l.read(100).phase).toBe('waiting');
    expect(l.frame(1,200)).toBe(true);expect(l.read(201).phase).toBe('live');
    expect(l.frame(1,800)).toBe(false);expect(l.read(1300).phase).toBe('stale');
    expect(l.frame(2,1400)).toBe(true);expect(l.read(1400).phase).toBe('live');
  });
  it('rejects backwards and nonfinite presentation counters and clears on reset',()=>{
    const l=createFrameLiveness();l.frame(20,1000);
    expect(l.frame(19,2000)).toBe(false);expect(l.frame(NaN,2000)).toBe(false);expect(l.read(2100).phase).toBe('stale');
    l.reset();expect(l.read(2200).phase).toBe('waiting');
  });
});
const binding:Binding={sourceId:'camera_A',runId:'run_A',trackId:'track_A',visitId:'visit_A',identityEpoch:'epoch_A',state:'matched',sinceMs:1000,lastVerifiedAtMs:1900,bounds:{x:.1,y:.2,width:.3,height:.4},observedLocation:{label:'Left chair',observedAtMs:1900}};
const room:RoomSnapshot={...emptyRoom,cameraState:'live',serverNowMs:2000,visits:[{id:'visit_A',label:'Patient 021',createdAtMs:1,preferredName:null,consentAtMs:1,completedAtMs:1,answers:null,summary:null,assignedSeat:{label:'Seat B',assignedAtMs:1}}],bindings:[binding]};
describe('same-source conservative staff selection overlays',()=>{
  it('uses current verified location instead of assigned seat, and highlights the selected request visit',()=>{
    const r={...room,requests:[{id:'request_A',visitId:'visit_A',trackId:'old_track',identityEpoch:'old_epoch',state:'open' as const,createdAtMs:1000,updatedAtMs:1900,snapshotVersion:2,reason:'sustained-seated-posture-change' as const,durationMs:20000,location:'old location',facts:[]}]};
    expect(cameraOverlays(r,{sourceId:'camera_A',runId:'run_A'},null,'request_A')).toMatchObject([{label:'Patient 021',location:'Left chair',selected:true,verified:true,trackId:'track_A'}]);
  });
  it('rejects mismatched source/run, old/future/invalid boxes and camera-off snapshots',()=>{
    expect(cameraOverlays(room,{sourceId:'camera_A',runId:'new_run'},'visit_A',null)).toEqual([]);
    for(const b of [{...binding,lastVerifiedAtMs:500},{...binding,lastVerifiedAtMs:2100},{...binding,bounds:{x:.9,y:0,width:.4,height:.2}}])expect(cameraOverlays({...room,bindings:[b]},{sourceId:'camera_A',runId:'run_A'},'visit_A',null)).toEqual([]);
    expect(cameraOverlays({...room,cameraState:'stale'},{sourceId:'camera_A',runId:'run_A'},'visit_A',null)).toEqual([]);
    expect(cameraOverlays(room,null,'visit_A',null)).toEqual([]);
  });
  it('never highlights a patient for ambiguous duplicate matches or unknown tracks',()=>{
    const duplicate={...binding,trackId:'track_B'};
    const overlays=cameraOverlays({...room,bindings:[binding,duplicate]},{sourceId:'camera_A',runId:'run_A'},'visit_A',null);
    expect(overlays).toHaveLength(2);expect(overlays.every(o=>!o.verified&&!o.selected&&o.label==='Identity uncertain')).toBe(true);
    const unknown=cameraOverlays({...room,bindings:[{...binding,visitId:null,state:'unknown'}]},{sourceId:'camera_A',runId:'run_A'},'visit_A',null);
    expect(unknown[0]).toMatchObject({label:'Unrecognized track',selected:false,verified:false});
  });
});
