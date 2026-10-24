import type { SensorWorkerRequest,SensorWorkerResponse } from './sensor-protocol.ts';
import type { LocalPoseModel } from '../sensing/pose-model.ts';
export function createSensorWorkerHandler(options:{load:()=>Promise<LocalPoseModel>;post:(message:SensorWorkerResponse)=>void}){
 let model:LocalPoseModel|null=null,loading:Promise<LocalPoseModel>|null=null;
 return async function handle(message:SensorWorkerRequest){
  if(message.kind==='sensor-init'){
   try{loading??=options.load();model=await loading;options.post({kind:'sensor-ready',id:message.id});}
   catch{loading=null;options.post({kind:'sensor-error',id:message.id,reason:'Local pose model could not initialize'});}return;
  }
  if(message.kind!=='sensor-pose')return;
  const {frame}=message;
  try{
   if(!model)throw Error('Not initialized');
   const landmarks=model.detect(frame.image,frame.monotonicMs);
   options.post({kind:'sensor-pose-result',id:message.id,runId:frame.runId,frameSeq:frame.seq,sourceAtMs:frame.sourceAtMs,landmarks});
  }catch{options.post({kind:'sensor-error',id:message.id,reason:model?'Pose inference failed':'Pose model is not initialized'});}
  finally{frame.image.close();}
 };
}
