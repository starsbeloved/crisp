import { expect, it, vi } from 'vitest';
import { createSensorSession } from '../client/runtime/sensor-session.ts';
import type { BoundFrame, ReferenceControl } from '../shared/contracts.ts';
import type { PoseLandmark } from '../client/sensing/pose.ts';
import type { SensorMeasurement,SensorPose } from '../client/runtime/sensor-transport.ts';
function frame(t=0):BoundFrame{return {frame:{runId:'run',seq:t+1,sourceAtMs:t,monotonicMs:t,width:640,height:480,image:{close:vi.fn()} as unknown as ImageBitmap},binding:{trackId:'track',visitId:'visit',identityEpoch:'epoch',state:'matched',sourceSinceAtMs:0,sourceLastVerifiedAtMs:t,bounds:{x:0.1,y:0.05,width:0.8,height:0.9},observedLocation:null},faceSkin:[],identityStamp:{frameSeq:t+1,sourceAtMs:t,identityEpoch:'epoch'},poseStamp:null,torso:null,selectedPersonCount:1,poseMotion:null,faceMotionWidthsPerSecond:0,associationUsable:true,invalidReason:null};}
function landmarks():PoseLandmark[]{const p=Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:1}));p[0]={...p[0],y:0.15};for(const [i,x,y,z] of [[11,.3,.3,0],[12,.7,.3,0],[23,.38,.65,0],[24,.62,.65,0],[25,.38,.72,-.2],[26,.62,.72,-.2],[27,.38,.95,-.2],[28,.62,.95,-.2]])p[i]={...p[i],x,y,z};return p;}
const control:ReferenceControl={trackId:'track',visitId:'visit',identityEpoch:'epoch',generation:1};
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function setup(){let now=0,sync='sync';const poses:SensorPose[]=[],measurements:SensorMeasurement[]=[],seen:BoundFrame[]=[];const infer=vi.fn(async(f:BoundFrame['frame'])=>({kind:'sensor-pose-result' as const,id:1,runId:f.runId,frameSeq:f.seq,sourceAtMs:f.sourceAtMs,landmarks:[landmarks()]}));
 const runtime=()=>({push:(f:BoundFrame)=>{seen.push(f);},reset:vi.fn(),dispose:vi.fn()});
 const session=createSensorSession({sourceId:'camera',runId:'run',getSyncId:()=>sync,getContinuityKey:()=> 'stable',nowMs:()=>now,worker:{initialize:async()=>{},infer,invalidate:vi.fn(),dispose:vi.fn()},clone:async()=>({close:vi.fn()} as unknown as ImageBitmap),emitMeasurement:m=>measurements.push(m),emitPose:p=>poses.push(p),rppgFactory:runtime,breathingFactory:runtime});
 return {session,poses,measurements,seen,infer,setNow:(t:number)=>{now=t;},setSync:(s:string)=>{sync=s;}};
}
it('enriches sampling with actual recent pose stamps while preserving borrowed bitmap ownership',async()=>{
 const s=setup();await s.session.initialize();s.session.setReferenceControls([control]);const f=frame();s.session.push(f);await tick();s.setNow(100);s.session.push(frame(100));await tick();s.setNow(140);const current=frame(140);s.session.push(current);
 expect(s.seen.at(-1)?.poseStamp).toEqual({frameSeq:101,sourceAtMs:100,identityEpoch:'epoch'});expect(s.seen.at(-1)?.torso).not.toBeNull();expect(current.frame.image.close).not.toHaveBeenCalled();expect(f.frame.image.close).not.toHaveBeenCalled();expect(s.poses).toHaveLength(2);s.session.dispose();
});
it('nurse reference generation cancels old inference and requires a new reference',async()=>{
 const s=setup();await s.session.initialize();s.session.setReferenceControls([control]);s.session.push(frame());await tick();s.session.setReferenceControls([{...control,generation:2}]);s.setNow(100);s.session.push(frame(100));await tick();expect(s.poses.at(-1)).toMatchObject({referenceGeneration:2,referenceReady:false});expect(s.poses.at(-1)?.features.referenceCollectedMs).toBe(0);s.session.dispose();
});
it('does not submit stale or changed-identity inference results',async()=>{
 const s=setup();await s.session.initialize();s.session.setReferenceControls([control]);let finish!:(r:any)=>void;s.infer.mockImplementationOnce(f=>new Promise(r=>{finish=r;}));s.session.push(frame());await tick();s.setNow(300);const ambiguous=frame(300);ambiguous.associationUsable=false;s.session.push(ambiguous);finish({kind:'sensor-pose-result',id:1,runId:'run',frameSeq:1,sourceAtMs:0,landmarks:[landmarks()]});await tick();expect(s.poses).toEqual([]);expect(s.seen.at(-1)?.poseStamp).toBeNull();s.session.dispose();
});
it('pose processing stays continuous across a compatible routine clock mapping refresh',async()=>{
 const s=setup();await s.session.initialize();s.session.setReferenceControls([control]);s.session.push(frame());await tick();s.setSync('sync2');s.setNow(100);s.session.push(frame(100));await tick();expect(s.poses.at(-1)?.activity).toBe('stationary');s.session.dispose();
});
it('does not use initial generation 1 until confirmed by authenticated room controls',async()=>{const s=setup();await s.session.initialize();s.session.push(frame());await tick();expect(s.infer).not.toHaveBeenCalled();expect(s.poses).toEqual([]);s.session.dispose();});

it('does not lose a usable pulse window when routine compatible sync refreshes before 30s',async()=>{
 let now=0,sync='sync1';const measurements:SensorMeasurement[]=[];
 const worker={initialize:async()=>{},infer:async(f:BoundFrame['frame'])=>({kind:'sensor-pose-result' as const,id:1,runId:f.runId,frameSeq:f.seq,sourceAtMs:f.sourceAtMs,landmarks:[landmarks()]}),invalidate:()=>{},dispose:()=>{}};
 const session=createSensorSession({sourceId:'camera',runId:'run',getSyncId:()=>sync,getContinuityKey:()=> 'same-mapping-continuity',nowMs:()=>now,worker,emitMeasurement:m=>measurements.push(m),emitPose:()=>{},readPixels:f=>{
  const data=new Uint8ClampedArray(160*160*4),w=Math.sin(2*Math.PI*1.2*f.frame.sourceAtMs/1000);for(let i=0;i<data.length;i+=4){data[i]=128+w*2;data[i+1]=100+w*5;data[i+2]=80+w;data[i+3]=255;}return {width:160,height:160,data};
 }});
 await session.initialize();session.setReferenceControls([control]);
 for(let i=0;i<=900;i++){now=i*1000/30;if(i===890)sync='sync2';const f=frame(now);f.frame.width=f.frame.height=160;f.faceSkin=[{x:0.1,y:0.1,width:0.4,height:0.2}];session.push(f);await tick();}
 const usable=measurements.filter(m=>m.streamId==='rppg'&&m.value!==null);expect(usable.at(-1)).toMatchObject({value:expect.closeTo(72,0),syncId:'sync2',sourceStartAtMs:0,sourceEndAtMs:30000});session.dispose();
});

it('a late room response cannot roll a checked reference generation backward',async()=>{
 const s=setup();await s.session.initialize();s.session.setReferenceControls([{...control,generation:2}]);s.session.push(frame());await tick();s.session.setReferenceControls([control]);s.setNow(100);s.session.push(frame(100));await tick();expect(s.poses.at(-1)?.referenceGeneration).toBe(2);s.session.dispose();
});
