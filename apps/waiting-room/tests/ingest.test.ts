import { afterEach, expect, it } from 'vitest';
import { createStore, type WaitingRoomStore } from '../server/store.ts';
import { createClockService, type ClockPrincipal } from '../server/clock.ts';
import { createIngestService } from '../server/ingest.ts';
import type { BindingBatch, BindingInput, Measurement, PoseObservation } from '../shared/contracts.ts';
import { toDashboardView } from '../shared/view-model.ts';
import { roomSnapshotSchema } from '../shared/schemas.ts';
const stores:WaitingRoomStore[]=[];
afterEach(()=>{for(const s of stores.splice(0))s.close();});
function setup(uncertaintyMs=0){
  let time=100000;const now=()=>time;const store=createStore({databasePath:':memory:',now});stores.push(store);
  const visit=store.createVisit({requestId:'visit'}),other=store.createVisit({requestId:'other'});
  const clocks=createClockService({now}),principal:ClockPrincipal={sessionId:'staff',role:'station',visitId:null};
  const sync=(runId='run')=>{const h=clocks.start(principal,{phase:'start',sourceId:'camera',runId,clientSendMs:time-90000-uncertaintyMs});return clocks.complete(principal,{phase:'complete',handshakeId:h.handshakeId,clientReceiveMs:time-90000+uncertaintyMs});};
  let clock=sync();const service=createIngestService({store,clocks,now});let seq=0;
  const binding=(extra:Partial<BindingInput>={}):BindingInput=>({trackId:'track',visitId:visit.id,identityEpoch:'epoch',state:'matched',sourceSinceAtMs:10000,sourceLastVerifiedAtMs:time-90000,bounds:{x:.1,y:.1,width:.3,height:.5},observedLocation:{label:'Window side',sourceObservedAtMs:time-90000},...extra});
  const batch=(bindings:BindingInput[]=[binding()],extra:Partial<BindingBatch>={}):BindingBatch=>({schemaVersion:1,id:`b${++seq}`,sourceId:'camera',runId:clock.runId,streamId:'binding',seq,syncId:clock.id,sourceAtMs:time-90000,bindings,...extra});
  const bind=(bindings?:BindingInput[],extra?:Partial<BindingBatch>)=>service.updateBindings(principal,batch(bindings,extra));
  const measurement=(extra:Partial<Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>>={})=>({schemaVersion:1 as const,id:`m${seq}`,sourceId:'camera',runId:clock.runId,seq:1,syncId:clock.id,streamId:'rppg' as const,channel:'pulse' as const,method:'camera-pos' as const,trackId:'track',visitId:visit.id,identityEpoch:'epoch',captureId:null,sourceStartAtMs:10000,sourceEndAtMs:time-90000,quality:'usable' as const,value:72,unit:'bpm' as const,provenance:'live_camera' as const,reason:null,metrics:{},...extra});
  const pose=(extra:Partial<Omit<PoseObservation,'alignedAtMs'|'receivedAtMs'>>={})=>({schemaVersion:1 as const,id:`p${time}`,sourceId:'camera',runId:clock.runId,seq:time,syncId:clock.id,streamId:'pose' as const,referenceGeneration:1,sourceAtMs:time-90000,trackId:'track',visitId:visit.id,identityEpoch:'epoch',quality:'usable' as const,provenance:'live_camera' as const,activity:'stationary' as const,seated:true,qualifyingSlump:false,referenceReady:true,reason:null,features:{},...extra});
  const ingest=(measurements:unknown[]=[],poses:unknown[]=[])=>service.ingestObservations(principal,{measurements,poses});
  return {store,service,principal,visit,other,clocks,bind,batch,binding,measurement,pose,ingest,advance:(ms:number)=>{time+=ms;},setClock:(run='run')=>{clock=sync(run);return clock;}};
}
it('aligns skewed bindings and preserves independent interleaved pose/pulse/breathing sequence streams',()=>{
  const s=setup();expect(s.bind()).toEqual({accepted:1,duplicates:0,rejected:0});
  const m=s.measurement(),p=s.pose({seq:1}),b=s.measurement({id:'breath',streamId:'breathing',channel:'breathing',method:'camera-torso-motion',value:15,unit:'breaths/min'});
  expect(s.ingest([m,b],[p])).toEqual({accepted:3,duplicates:0,rejected:0});
  const room=s.service.getRoomSnapshot();expect(roomSnapshotSchema.safeParse(room).success).toBe(true);
  expect(room.bindings[0]).toMatchObject({sinceMs:100000,lastVerifiedAtMs:100000});
  expect(room.measurements[0]).toMatchObject({alignedStartAtMs:100000,alignedEndAtMs:100000,receivedAtMs:100000,value:72});
  expect(room.poses[0]).toMatchObject({alignedAtMs:100000});
});
it('keeps a continuous epoch across a valid resync without moving its original aligned start',()=>{
  const s=setup();s.bind();s.advance(1000);
  const handshake=s.clocks.start(s.principal,{phase:'start',sourceId:'camera',runId:'run',clientSendMs:11001});
  const sync=s.clocks.complete(s.principal,{phase:'complete',handshakeId:handshake.handshakeId,clientReceiveMs:11001});
  expect(s.bind(undefined,{syncId:sync.id}).accepted).toBe(1);
  expect(s.service.getRoomSnapshot().bindings[0]).toMatchObject({sinceMs:100000,lastVerifiedAtMs:100999});
  expect(s.ingest([], [s.pose({syncId:sync.id})]).accepted).toBe(1);
});
it('deduplicates exact retries and rejects conflicting IDs, sequences and reversed end times per stream',()=>{
  const s=setup();const batch=s.batch();s.service.updateBindings(s.principal,batch);
  expect(s.service.updateBindings(s.principal,batch).duplicates).toBe(1);
  expect(()=>s.service.updateBindings(s.principal,{...batch,bindings:[]})).toThrowError(expect.objectContaining({status:409}));
  const m=s.measurement();s.ingest([m]);expect(s.ingest([m]).duplicates).toBe(1);
  expect(()=>s.ingest([{...m,value:80}])).toThrowError(expect.objectContaining({status:409}));
  expect(()=>s.ingest([{...m,id:'new',value:80}])).toThrowError(expect.objectContaining({status:409}));
  expect(s.ingest([{...m,id:'reversal',seq:2,sourceStartAtMs:9999,sourceEndAtMs:9999}]).rejected).toBe(1);
  s.advance(1000);s.bind();expect(s.ingest([{...m,id:'overlap',seq:2,sourceEndAtMs:11000}]).accepted).toBe(1);
});
it('rejects unknown visits, mismatched epochs and full windows crossing identity reassignment',()=>{
  const s=setup();s.bind();s.advance(1000);s.bind();
  expect(s.ingest([s.measurement({visitId:'missing'})]).rejected).toBe(1);
  expect(s.ingest([s.measurement({identityEpoch:'wrong',id:'wrong'})]).rejected).toBe(1);
  s.advance(1000);s.bind([s.binding({visitId:s.other.id,identityEpoch:'other_epoch',sourceSinceAtMs:12000})]);
  expect(s.ingest([s.measurement({id:'cross',seq:3,sourceEndAtMs:12000})]).rejected).toBe(1);
  expect(s.ingest([s.measurement({id:'historical',seq:4,sourceEndAtMs:11000})]).accepted).toBe(1);
  expect(s.service.getRoomSnapshot().measurements[0].visitId).toBe(s.visit.id);
});
it('closes full snapshot losses and cannot revive a lost epoch or delayed old matched update',()=>{
  const s=setup();s.bind();s.advance(1000);s.bind([s.binding({state:'uncertain',visitId:null,identityEpoch:'uncertain',sourceSinceAtMs:11000})]);
  expect(s.bind([s.binding({sourceLastVerifiedAtMs:10000,observedLocation:null})],{id:'delayed',seq:0,sourceAtMs:10000}).rejected).toBe(1);
  expect(s.bind([s.binding()]).rejected).toBe(1);
  expect(s.ingest([s.measurement({id:'uncertain',sourceEndAtMs:11000})]).rejected).toBe(1);
  s.advance(1000);s.bind([]);expect(s.service.getRoomSnapshot().bindings).toEqual([]);
});
it('closes continuity on heartbeat expiry, requires a new epoch and retires older source runs',()=>{
  const s=setup();s.bind();s.advance(1001);expect(s.service.getRoomSnapshot().cameraState).toBe('stale');
  expect(s.bind().rejected).toBe(1);
  expect(s.bind([s.binding({identityEpoch:'epoch2',sourceSinceAtMs:11001})]).accepted).toBe(1);
  const old=s.batch();s.setClock('run2');expect(s.bind([s.binding({identityEpoch:'epoch3',sourceSinceAtMs:11001})]).accepted).toBe(1);
  expect(s.service.updateBindings(s.principal,old).rejected).toBe(1);
});
it('does not allow a new camera run to claim a window from before the previous run ended',()=>{
  const s=setup();s.bind();s.advance(1000);s.bind();s.setClock('run2');
  expect(s.bind([s.binding({identityEpoch:'new_run_epoch'})]).rejected).toBe(1);
  expect(s.bind([s.binding({identityEpoch:'new_run_epoch',sourceSinceAtMs:11000})]).accepted).toBe(1);
});
it('rejects clock-expired/future rows, invalid units, oversized input and unauthorized phone poses',()=>{
  const s=setup();s.bind();
  expect(()=>s.ingest([s.measurement({unit:'breaths/min'})])).toThrowError(expect.objectContaining({status:400}));
  expect(()=>s.ingest([],Array.from({length:101},(_,i)=>s.pose({id:`p${i}`,seq:i})))).toThrowError(expect.objectContaining({status:400}));
  expect(()=>s.service.ingestObservations({...s.principal,role:'patient',visitId:s.visit.id},{measurements:[],poses:[s.pose()]})).toThrowError(expect.objectContaining({status:403}));
  expect(()=>s.bind([s.binding({sourceLastVerifiedAtMs:12001})],{sourceAtMs:12001})).toThrowError(expect.objectContaining({code:'CLOCK_SOURCE_FUTURE'}));
  s.advance(60001);expect(()=>s.ingest([], [s.pose()])).toThrowError(expect.objectContaining({code:'CLOCK_SYNC_EXPIRED'}));
});
it('uses uncertainty bounds when accepting whole windows and never bridges an uncertain boundary',()=>{
  const s=setup(100);s.bind();
  expect(s.ingest([s.measurement()]).rejected).toBe(1);
  s.advance(1000);s.bind();
  expect(s.ingest([s.measurement({id:'inside',sourceStartAtMs:10200,sourceEndAtMs:10800})]).accepted).toBe(1);
  s.advance(1000);s.bind([s.binding({state:'uncertain',visitId:null,identityEpoch:'uncertain',sourceSinceAtMs:12000})]);
  expect(s.ingest([s.measurement({id:'boundary',seq:2,sourceStartAtMs:10200,sourceEndAtMs:11900})]).rejected).toBe(1);
});
it('rejects duplicate tracks or one visit assigned to two tracks atomically',()=>{
  const s=setup();expect(s.bind([s.binding(),s.binding({trackId:'track2'})]).rejected).toBe(2);
  expect(s.service.getRoomSnapshot().bindings).toEqual([]);
  expect(s.bind([s.binding(),s.binding({visitId:s.other.id})]).rejected).toBe(2);
});
it('never backdates a new matched epoch across uncertainty, loss or a different patient',()=>{
  const s=setup();s.bind();s.advance(1000);s.bind([s.binding({state:'uncertain',visitId:null,identityEpoch:'uncertain',sourceSinceAtMs:11000})]);
  s.advance(1000);
  expect(s.bind([s.binding({identityEpoch:'new',sourceSinceAtMs:10000})]).rejected).toBe(1);
  expect(s.bind([s.binding({identityEpoch:'new',sourceSinceAtMs:12000})]).accepted).toBe(1);
  s.advance(1000);s.bind([]);s.advance(1000);
  expect(s.bind([s.binding({identityEpoch:'after_loss',sourceSinceAtMs:12000})]).rejected).toBe(1);
});
it('keeps each visit separate when two identified patients swap locations and tracks',()=>{
  const s=setup();
  const a=s.binding(),b=s.binding({trackId:'second',visitId:s.other.id,identityEpoch:'second_epoch',observedLocation:{label:'Door side',sourceObservedAtMs:10000}});
  s.bind([a,b]);s.ingest([s.measurement()]);s.advance(1000);
  s.bind([s.binding({visitId:s.other.id,identityEpoch:'swapped_a',sourceSinceAtMs:11000}),s.binding({trackId:'second',identityEpoch:'swapped_b',sourceSinceAtMs:11000,observedLocation:{label:'Door side',sourceObservedAtMs:11000}})]);
  expect(s.ingest([s.measurement({id:'crossing',seq:2})]).rejected).toBe(1);
  expect(s.ingest([s.measurement({id:'new_patient',seq:2,visitId:s.other.id,identityEpoch:'swapped_a',sourceStartAtMs:11000})]).accepted).toBe(1);
  const room=s.service.getRoomSnapshot();expect(room.measurements.map(m=>[m.id,m.visitId])).toEqual([['m1',s.visit.id],['new_patient',s.other.id]]);
});
it('accepts a delayed historical window without making it current and does not mix batch conflict writes',()=>{
  const s=setup();s.bind();s.advance(5001);
  expect(s.ingest([s.measurement({sourceEndAtMs:10000})]).accepted).toBe(1);
  const view=toDashboardView(s.service.getRoomSnapshot(),{patientId:s.visit.id,requestId:null});
  expect(view.patients[0].readings[1]).toMatchObject({displayValue:'—',qualityLabel:'Stale'});
  expect(()=>s.ingest([s.measurement({id:'conflict'}),s.measurement({id:'conflict',value:80})])).toThrowError(expect.objectContaining({status:409}));
  expect(s.service.getObservationHistory().measurements).toHaveLength(1);
});
it('shows posture without a request, stales it after one second, and preserves historical readings',()=>{
  const s=setup();s.bind();s.ingest([s.measurement()],[s.pose()]);
  let view=toDashboardView(s.service.getRoomSnapshot(),{patientId:s.visit.id,requestId:null});
  expect(view.patients[0].pose.postureLabel).toBe('Seated');expect(view.patients[0].readings[1].displayValue).toBe('72');
  s.advance(1001);view=toDashboardView(s.service.getRoomSnapshot(),{patientId:s.visit.id,requestId:null});expect(view.patients[0].pose.qualityLabel).toBe('Stale');
  s.advance(4000);view=toDashboardView(s.service.getRoomSnapshot(),{patientId:s.visit.id,requestId:null});expect(view.patients[0].readings[1]).toMatchObject({displayValue:'—',qualityLabel:'Stale'});
  expect(s.service.getObservationHistory().measurements[0]).toMatchObject({value:72,quality:'usable',alignedEndAtMs:100000});
  s.advance(600000);expect(s.service.getObservationHistory().measurements).toEqual([]);
});
it('creates one deterministic request, freezes facts and invalidates provider context only on semantic changes',()=>{
  const s=setup();
  for(let i=0;i<=21;i++){
    if(i)s.advance(1000);s.bind();s.ingest([], [s.pose({qualifyingSlump:i>=11})]);
  }
  let room=s.service.getRoomSnapshot();expect(room.requests).toHaveLength(1);const event=room.requests[0];
  expect(event).toMatchObject({state:'open',durationMs:10000,createdAtMs:121000,location:'Window side',snapshotVersion:1});
  const frozen=s.service.buildAlertSnapshot(event.id);expect(frozen.facts.some(f=>f.kind==='missing')).toBe(true);
  for(let i=0;i<10;i++){s.advance(1000);s.bind([s.binding({bounds:{x:.2,y:.1,width:.3,height:.5}})]);s.ingest([], [s.pose({qualifyingSlump:true})]);}
  expect(s.service.getRoomSnapshot().requests[0].snapshotVersion).toBe(1);
  expect(s.service.buildAlertSnapshot(event.id).facts).toEqual(frozen.facts);
  s.advance(1000);s.bind([s.binding({observedLocation:{label:'Door side',sourceObservedAtMs:42000}})]);
  room=s.service.getRoomSnapshot();expect(room.requests[0]).toMatchObject({snapshotVersion:2,location:'Door side'});
  expect(room.requests[0].facts).toEqual(event.facts);
  s.advance(1001);expect(s.service.getRoomSnapshot().requests[0].snapshotVersion).toBe(3);
  expect(s.service.buildAlertSnapshot(event.id).binding).toBeNull();
});
it('persists actions and increments reference generation only once; fresh reference is required to rearm',()=>{
  const s=setup();for(let i=0;i<=21;i++){if(i)s.advance(1000);s.bind();s.ingest([], [s.pose({qualifyingSlump:i>=11})]);}
  const id=s.service.getRoomSnapshot().requests[0].id;
  expect(s.service.acknowledge(id,'ack').state).toBe('acknowledged');
  s.advance(100);s.bind();
  const checked=s.service.markChecked(id,'check');expect(checked.referenceControl?.generation).toBe(2);
  expect(s.service.markChecked(id,'check')).toEqual(checked);expect(s.service.markChecked(id,'check2').referenceControl?.generation).toBe(2);
  expect(s.ingest([], [s.pose({id:'precheck',seq:121001,sourceAtMs:31050,referenceGeneration:2})]).rejected).toBe(1);
  s.advance(900);s.bind();expect(s.ingest([], [s.pose({qualifyingSlump:true})]).rejected).toBe(1);
  for(let i=0;i<=10;i++){if(i){s.advance(1000);s.bind();}s.ingest([], [s.pose({referenceGeneration:2,qualifyingSlump:true})]);}
  expect(s.service.getRoomSnapshot().requests).toHaveLength(1);
  for(let i=0;i<=21;i++){s.advance(1000);s.bind();s.ingest([], [s.pose({referenceGeneration:2,qualifyingSlump:i>=11})]);}
  expect(s.service.getRoomSnapshot().requests).toHaveLength(2);
});
it('follows a reidentified visit to its current track and checks that current reference without changing triggering facts',()=>{
  const s=setup();for(let i=0;i<=21;i++){if(i)s.advance(1000);s.bind();s.ingest([], [s.pose({qualifyingSlump:i>=11})]);}
  const original=s.service.getRoomSnapshot().requests[0];
  s.advance(1000);s.bind([s.binding({trackId:'new_track',identityEpoch:'new_epoch',sourceSinceAtMs:32000,observedLocation:{label:'Door side',sourceObservedAtMs:32000}})]);
  const snapshot=s.service.buildAlertSnapshot(original.id);
  expect(snapshot.binding).toMatchObject({trackId:'new_track',visitId:s.visit.id,identityEpoch:'new_epoch'});
  expect(snapshot.event).toMatchObject({trackId:'track',identityEpoch:'epoch',location:'Door side',snapshotVersion:2});
  expect(snapshot.facts).toEqual(original.facts);
  s.ingest([], [s.pose({trackId:'new_track',identityEpoch:'new_epoch'})]);
  expect(s.service.markChecked(original.id,'checked_moved').referenceControl).toEqual({trackId:'new_track',visitId:s.visit.id,identityEpoch:'new_epoch',generation:2});
});
it.each(['synthetic','replay'] as const)('retains %s observations with provenance without triggering',provenance=>{
  const s=setup();for(let i=0;i<=22;i++){if(i)s.advance(1000);s.bind();s.ingest([], [s.pose({provenance,qualifyingSlump:i>=11})]);}
  expect(s.service.getRoomSnapshot().requests).toEqual([]);expect(s.service.getObservationHistory().poses[0].provenance).toBe(provenance);
});
