import type { FramePacket } from '../../shared/contracts.ts';
import type { SensorWorkerRequest,SensorWorkerResponse } from './sensor-protocol.ts';
export class SupersededPoseWork extends Error {}
type PoseResponse=Extract<SensorWorkerResponse,{kind:'sensor-pose-result'}>;
type Work={id:number;frame:FramePacket;resolve:(result:PoseResponse)=>void;reject:(reason:Error)=>void};
/** Owns submitted clones, never camera-borrowed images. Worker owns each transferred
 * bitmap; pending frames remain here and close when replaced or disposed.
 */
export function createPoseWorkerClient(worker:Worker){
 let id=0,disposed=false,ready=false,flight:Work|null=null,pending:Work|null=null,timeout:ReturnType<typeof setTimeout>|null=null;
 let initialization:{id:number;promise:Promise<void>;resolve:()=>void;reject:(e:Error)=>void}|null=null;
 const clearTimer=()=>{if(timeout)clearTimeout(timeout);timeout=null;};
 const rejectPending=(e:Error)=>{pending?.frame.image.close();pending?.reject(e);pending=null;};
 function terminate(e:Error){if(disposed)return;disposed=true;clearTimer();initialization?.reject(e);initialization=null;flight?.reject(e);flight=null;rejectPending(e);worker.removeEventListener('message',message);worker.removeEventListener('error',error);worker.terminate();}
 function dispatch(work:Work){
  flight=work;
  try{worker.postMessage({kind:'sensor-pose',id:work.id,frame:work.frame} satisfies SensorWorkerRequest,[work.frame.image]);
   timeout=setTimeout(()=>terminate(Error('Pose worker timed out; reconnect the station')),1500);
  }catch{work.frame.image.close();terminate(Error('Could not transfer pose inference frame'));}
 }
 function message(event:MessageEvent<SensorWorkerResponse>){
  const value=event.data;
  if(!value||disposed)return;
  if(initialization&&value.id===initialization.id){if(value.kind==='sensor-ready'){clearTimer();ready=true;initialization.resolve();initialization=null;}else if(value.kind==='sensor-error')terminate(Error(value.reason));return;}
  if(!flight||value.id!==flight.id)return;
  const work=flight;flight=null;clearTimer();
  if(value.kind==='sensor-pose-result'&&value.runId===work.frame.runId&&value.frameSeq===work.frame.seq&&value.sourceAtMs===work.frame.sourceAtMs)work.resolve(value);
  else {const failure=Error(value.kind==='sensor-error'?value.reason:'Pose worker returned a mismatched frame stamp');work.reject(failure);terminate(failure);return;}
  const next=pending;pending=null;if(next&&!disposed)dispatch(next);
 }
 const error=()=>terminate(Error('Pose inference worker failed; reconnect the station'));
 worker.addEventListener('message',message);worker.addEventListener('error',error);
 return {
  initialize():Promise<void>{
   if(disposed)return Promise.reject(Error('Pose worker stopped'));if(ready)return Promise.resolve();if(initialization)return initialization.promise;
   let resolve!:()=>void,reject!:(e:Error)=>void;const promise=new Promise<void>((a,b)=>{resolve=a;reject=b;});initialization={id:++id,promise,resolve,reject};
   try{worker.postMessage({kind:'sensor-init',id} satisfies SensorWorkerRequest);timeout=setTimeout(()=>terminate(Error('Pose model initialization timed out')),20000);}catch{terminate(Error('Pose worker initialization failed'));}return promise;
  },
  infer(frame:FramePacket):Promise<PoseResponse>{
   if(disposed||!ready){frame.image.close();return Promise.reject(Error('Pose worker unavailable'));}
   return new Promise((resolve,reject)=>{const work={id:++id,frame,resolve,reject};if(flight){rejectPending(new SupersededPoseWork('Replaced by a newer pose frame'));pending=work;}else dispatch(work);});
  },
  invalidate(){rejectPending(new SupersededPoseWork('Pose continuity changed'));},
  dispose(){terminate(new SupersededPoseWork('Pose worker stopped'));},
 };
}
export type PoseWorkerClient=ReturnType<typeof createPoseWorkerClient>;
export function createBrowserPoseWorker(){return createPoseWorkerClient(new Worker(new URL('./inference.worker.ts',import.meta.url),{type:'module'}));}
