import { expect,it } from 'vitest';
import { createStore } from '../server/store.ts';
import { createClockService } from '../server/clock.ts';
import { createIngestService } from '../server/ingest.ts';
import { createSensorSession } from '../client/runtime/sensor-session.ts';
import { createSensorTransport } from '../client/runtime/sensor-transport.ts';
import type { BindingBatch, BoundFrame, ClockSync } from '../shared/contracts.ts';
import type { PoseLandmark } from '../client/sensing/pose.ts';

/** Synthetic decoded-frame/model seam, real feature processor/clock/transport/
 * server detector/SQLite lifecycle. This does not open or validate a camera.
 */
it('connects frames through pose worker results to backend request, acknowledgement and fresh checked reference',async()=>{
 let time=100000,source=10000,seq=0,sync:ClockSync;
 const store=createStore({databasePath:':memory:',now:()=>time});
 const clocks=createClockService({now:()=>time}),principal={sessionId:'station',role:'station' as const,visitId:null};
 const handshake=clocks.start(principal,{phase:'start',sourceId:'camera',runId:'run',clientSendMs:source});
 sync=clocks.complete(principal,{phase:'complete',handshakeId:handshake.handshakeId,clientReceiveMs:source});
 const visit=store.createVisit({requestId:'synthetic_visit'}),service=createIngestService({store,clocks,now:()=>time});
 const statuses:string[]=[],poses:number[]=[];
 const transport=createSensorTransport({sourceId:'camera',runId:'run',nowMs:()=>source,mapping:id=>id===sync.id?sync:null,onStatus:s=>statuses.push(s.state),transport:{bindings:async b=>service.updateBindings(principal,b),observations:async b=>{poses.push(...b.poses.map(p=>p.referenceGeneration));return service.ingestObservations(principal,b);}}});
 function points(droop:number):PoseLandmark[]{const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));p[0]={...p[0],y:.15+droop};for(const [i,x,y,z] of [[11,.3,.3,0],[12,.7,.3,0],[23,.38,.65,0],[24,.62,.65,0],[25,.38,.72,-.2],[26,.62,.72,-.2],[27,.38,.95,-.2],[28,.62,.95,-.2]])p[i]={...p[i],x,y,z};return p;}
 const session=createSensorSession({sourceId:'camera',runId:'run',getSyncId:()=>sync.id,getContinuityKey:()=> 'stable',nowMs:()=>source,worker:{initialize:async()=>{},infer:async f=>({kind:'sensor-pose-result',id:1,runId:f.runId,frameSeq:f.seq,sourceAtMs:f.sourceAtMs,landmarks:[points(f.sourceAtMs>=21500&&f.sourceAtMs<35000?.07:0)]}),invalidate:()=>{},dispose:()=>{}},clone:async()=>({close:()=>{}} as ImageBitmap),emitMeasurement:transport.measurement,emitPose:transport.pose,
  readPixels:()=>({width:640,height:480,data:new Uint8ClampedArray(640*480*4)}),
  // Image quality is separately tested. Here both real runtimes reject flat pixels.
 });
 await session.initialize();
 async function step(elapsed:number){
  time=100000+elapsed;source=10000+elapsed;const currentSeq=++seq;
  const binding={trackId:'track',visitId:visit.id,identityEpoch:'epoch',state:'matched' as const,sourceSinceAtMs:10000,sourceLastVerifiedAtMs:source,bounds:{x:.1,y:.05,width:.8,height:.9},observedLocation:{label:'B4',sourceObservedAtMs:source}};
  const batch:BindingBatch={schemaVersion:1,id:`binding_${seq}`,sourceId:'camera',runId:'run',streamId:'binding',seq,syncId:sync.id,sourceAtMs:source,bindings:[binding]};
  transport.bindings(batch);await transport.flush();session.setReferenceControls(service.getRoomSnapshot().referenceControls);
  const frame:BoundFrame={frame:{runId:'run',seq:currentSeq,sourceAtMs:source,monotonicMs:elapsed,width:640,height:480,image:{close:()=>{}} as ImageBitmap},binding,faceSkin:[],identityStamp:{frameSeq:currentSeq,sourceAtMs:source,identityEpoch:'epoch'},poseStamp:null,torso:null,selectedPersonCount:1,poseMotion:null,faceMotionWidthsPerSecond:0,associationUsable:true,invalidReason:null};
  session.push(frame);for(let i=0;i<12;i++)await Promise.resolve();await transport.flush();
 }
 try{
  for(let t=0;t<=22500;t+=100)await step(t);
  const room=service.getRoomSnapshot();expect(statuses).not.toContain('failed');expect(room.poses[0]).toMatchObject({quality:'usable',referenceReady:true,qualifyingSlump:true});expect(room.requests).toHaveLength(1);
  const event=room.requests[0];expect(event).toMatchObject({visitId:visit.id,state:'open',durationMs:10000,location:'B4'});
  expect(service.acknowledge(event.id,'ack').state).toBe('acknowledged');const checked=service.markChecked(event.id,'checked');expect(checked.referenceControl?.generation).toBe(2);
  for(let t=22600;t<=23500;t+=100)await step(t);
  expect(poses.at(-1)).toBe(2);expect(service.getRoomSnapshot().poses[0]).toMatchObject({referenceGeneration:2,referenceReady:false});expect(service.getRoomSnapshot().requests).toHaveLength(1);
 }finally{session.dispose();transport.dispose();clocks.dispose();store.close();}
},20000);
