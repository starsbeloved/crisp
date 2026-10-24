import type { BoundFrame, ReferenceControl, SensorContext, SensorRuntime } from '../../shared/contracts.ts';
import { createStreamAllocators, metadataEligibility } from './frame-bus.ts';
import { createPoseProcessor } from '../sensing/pose.ts';
import { createRppgRuntime } from '../sensing/rppg.ts';
import { createBreathingRuntime } from '../sensing/breathing.ts';
import { createPixelReader } from '../sensing/pixels.ts';
import type { PixelReaderOptions, PixelPlane } from '../sensing/pixels.ts';
import type { MeasurementEmitter } from '../sensing/runtime.ts';
import type { PoseWorkerClient } from './sensor-worker-client.ts';
import { SupersededPoseWork } from './sensor-worker-client.ts';
import type { SensorPose } from './sensor-transport.ts';
export type SensingStatus={state:'initializing'|'ready'|'unavailable'|'stopped';reason:string|null;poseLatencyMs:number|null};
type Factory=(context:SensorContext,emit:MeasurementEmitter,options?:PixelReaderOptions)=>SensorRuntime;
const controlKey=(c:ReferenceControl)=>JSON.stringify([c.trackId,c.visitId,c.identityEpoch,c.generation]);
/** Bridges borrowed real-camera sampling with independently cloned worker inference.
 * No camera, HTTP, frame bus ownership or provider side effect occurs here.
 */
export function createSensorSession(options:{sourceId:string;runId:string;getSyncId:()=>string|null;getContinuityKey:()=>string|null;nowMs:()=>number;worker:PoseWorkerClient;emitMeasurement:MeasurementEmitter;emitPose:(p:SensorPose)=>void;onStatus?:(s:SensingStatus)=>void;clone?:(image:ImageBitmap)=>Promise<ImageBitmap>;readPixels?:(f:BoundFrame)=>PixelPlane;rppgFactory?:Factory;breathingFactory?:Factory}){
 const allocate=createStreamAllocators();let processor=createPoseProcessor({getContinuityKey:options.getContinuityKey});
 const context=(stream:'pose'|'rppg'|'breathing'):SensorContext=>({sourceId:options.sourceId,runId:options.runId,getSyncId:options.getSyncId,nextSeq:allocate(stream)}),poseContext=context('pose');
 let disposed=false,ready=false,generation=0,lastAttempt=-Infinity,lastAt:number|null=null,lastSeq=-1,key:string|null=null,cloneBusy=false,latestControl:ReferenceControl|null=null;
 const generations=new Map<string,ReferenceControl>();
 let controls:ReferenceControl[]=[],status:SensingStatus={state:'initializing',reason:'Loading local pose model',poseLatencyMs:null};
 let cached:{result:ReturnType<typeof processor.process>;stamp:NonNullable<BoundFrame['poseStamp']>;key:string}|null=null;
 let cachedPixels:PixelPlane|null=null,cachedFrameSeq=-1;
 const read=options.readPixels??createPixelReader(),readPixels=(f:BoundFrame)=>{if(cachedFrameSeq!==f.frame.seq||!cachedPixels){cachedPixels=read(f);cachedFrameSeq=f.frame.seq;}return cachedPixels;};
 const runtimeOptions={readPixels,getContinuityKey:options.getContinuityKey};
 const pulse=(options.rppgFactory??createRppgRuntime)(context('rppg'),options.emitMeasurement,runtimeOptions),breathing=(options.breathingFactory??createBreathingRuntime)(context('breathing'),options.emitMeasurement,runtimeOptions);
 const report=(state:SensingStatus['state'],reason:string|null=null,latency:number|null=null)=>{status={state,reason,poseLatencyMs:latency};options.onStatus?.({...status});};
 function reset(reason:string){if(disposed)return;generation++;cached=null;key=null;lastAttempt=-Infinity;lastAt=null;latestControl=null;processor=createPoseProcessor({getContinuityKey:options.getContinuityKey});options.worker.invalidate();pulse.reset(reason);breathing.reset(reason);cachedPixels=null;cachedFrameSeq=-1;}
 async function infer(metadata:BoundFrame,control:ReferenceControl,workKey:string,epoch:number,image:Promise<ImageBitmap>){
  let owned:ImageBitmap|null=null;
  try{
   owned=await image;cloneBusy=false;
   if(disposed||generation!==epoch){owned.close();owned=null;return;}
   const frame={...metadata.frame,image:owned};owned=null;
   const result=await options.worker.infer(frame);
   const age=options.nowMs()-metadata.frame.sourceAtMs;
   if(disposed||epoch!==generation||key!==workKey||age<0||age>250||!latestControl||controlKey(latestControl)!==controlKey(control))return;
   const pose=processor.process(metadata,control,poseContext,result.landmarks);
   if(pose.observation)options.emitPose(pose.observation);
   cached={result:pose,stamp:{frameSeq:metadata.frame.seq,sourceAtMs:metadata.frame.sourceAtMs,identityEpoch:control.identityEpoch},key:workKey};
   report('ready',null,age);
  }catch(error){owned?.close();cloneBusy=false;if(disposed||epoch!==generation||error instanceof SupersededPoseWork)return;cached=null;report('unavailable',error instanceof Error?error.message:'Pose inference unavailable');}
 }
 return {
  async initialize(){if(disposed)return;try{await options.worker.initialize();if(!disposed){ready=true;report('ready');}}catch(e){if(!disposed)report('unavailable',e instanceof Error?e.message:'Pose model unavailable');}},
  setReferenceControls(next:ReferenceControl[]){
   const old=latestControl;controls=next.map(c=>{const k=JSON.stringify([c.trackId,c.visitId,c.identityEpoch]),known=generations.get(k);const value=known&&known.generation>c.generation?known:{...c};generations.set(k,value);return {...value};});
   if(old){const replacement=controls.find(c=>c.trackId===old.trackId&&c.visitId===old.visitId&&c.identityEpoch===old.identityEpoch);
    if(!replacement||controlKey(old)!==controlKey(replacement)){reset('Nurse reference generation changed');if(replacement)processor.reset(replacement);}
   }
  },
  push(f:BoundFrame){
   if(disposed)return;
   if(f.frame.runId!==options.runId||f.frame.seq<=lastSeq)return;lastSeq=f.frame.seq;
   const eligible=metadataEligibility(f).identity,continuity=options.getContinuityKey();
   const control=eligible&&f.binding?controls.find(c=>c.trackId===f.binding!.trackId&&c.visitId===f.binding!.visitId&&c.identityEpoch===f.binding!.identityEpoch)??null:null;
   const nextKey=eligible&&continuity?JSON.stringify([continuity,f.binding!.trackId,f.binding!.visitId,f.binding!.identityEpoch,control?.generation??null]):null;
   if(nextKey!==key||(lastAt!==null&&(f.frame.sourceAtMs<=lastAt||f.frame.sourceAtMs-lastAt>200)))reset(eligible?'Fresh identity, clock or frame continuity':'Identity unavailable');
   key=nextKey;lastAt=f.frame.sourceAtMs;latestControl=control;
   let enriched:BoundFrame={...f,poseStamp:null,torso:null,poseMotion:null};
   if(cached&&cached.key===key&&f.frame.sourceAtMs>=cached.stamp.sourceAtMs&&f.frame.sourceAtMs-cached.stamp.sourceAtMs<=250&&cached.stamp.frameSeq<=f.frame.seq){enriched={...enriched,poseStamp:{...cached.stamp},torso:cached.result.torso,poseMotion:cached.result.poseMotion};}
   // Color/torso pixel consumers finish synchronously before camera closes the image.
   pulse.push(enriched);breathing.push(enriched);cachedPixels=null;cachedFrameSeq=-1;
   if(!ready||!eligible||!control||!nextKey||cloneBusy||f.frame.sourceAtMs-lastAttempt<100)return;
   lastAttempt=f.frame.sourceAtMs;cloneBusy=true;
   const {image:_borrowed,...frame}=f.frame;
   const metadata:BoundFrame={...f,frame:{...frame,image:undefined as unknown as ImageBitmap},binding:f.binding?structuredClone(f.binding):null,faceSkin:[]};
   // Invoke clone now, while borrowed source is alive. No closure retains it.
   let cloned:Promise<ImageBitmap>;try{cloned=(options.clone??createImageBitmap)(f.frame.image);}catch(e){cloneBusy=false;report('unavailable','Could not clone a pose inference frame');return;}
   void infer(metadata,{...control},nextKey,generation,cloned);
  },
  reset,
  status:()=>({...status}),
  dispose(){if(disposed)return;reset('Sensing stopped');disposed=true;pulse.dispose();breathing.dispose();options.worker.dispose();report('stopped');},
 };
}
export type SensorSession=ReturnType<typeof createSensorSession>;
