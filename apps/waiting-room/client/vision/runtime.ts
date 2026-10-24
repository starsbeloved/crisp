import type { BindingBatch, BindingInput, BoundFrame, Bounds, FramePacket, SensorContext } from '../../shared/contracts.ts';
import { createIdentityTracker, validBounds } from './identity.ts';
import type { VisionResources } from './resources.tsx';
import type { FaceDetection } from './types.ts';

export type VisionResult={bindings:BindingInput[];sourceAtMs:number|null;frameSeq:number|null;personCount:number;latencyMs:number|null;reason:string|null};
/** This runtime borrows sampling frames; inference gets its own independent clone.
 * The configured FaceAdapter must run heavy inference in a worker. No pending queue.
 */
export function createVisionRuntime(options:{context:SensorContext;nowMs:()=>number;resources:VisionResources;onBindings?:(batch:BindingBatch)=>void;onFrame?:(frame:BoundFrame)=>void;onResult?:(result:VisionResult)=>void;clone?:(image:ImageBitmap)=>Promise<ImageBitmap>}) {
  const {adapter,gallery,calibration,regions}=options.resources;
  const tracker=adapter?createIdentityTracker({gallery,modelId:adapter.modelId,similarity:(a,b)=>adapter.similarity(a,b),calibration,regions}):null;
  let generation=0,disposed=false,busy=false,lastAttempt=-Infinity,lastSeq=-1,galleryRevision=gallery.revision;
  let current:{frame:Pick<FramePacket,'seq'|'sourceAtMs'|'runId'>;bindings:BindingInput[];faces:FaceDetection[];motion:number|null}|null=null;
  let reason=adapter?'Collecting face confirmations':'Face recognition model unavailable';
  function batch(bindings:BindingInput[],sourceAtMs:number) {
    const syncId=options.context.getSyncId();
    if(!syncId)return;
    const seq=options.context.nextSeq();
    options.onBindings?.({schemaVersion:1,id:`${options.context.runId}_binding_${seq}`,sourceId:options.context.sourceId,runId:options.context.runId,streamId:'binding',seq,syncId,sourceAtMs,bindings});
  }
  function reset(why:string) {
    generation++;current=null;lastAttempt=-Infinity;reason=why;tracker?.reset();
    batch([],options.nowMs());
    options.onResult?.({bindings:[],sourceAtMs:null,frameSeq:null,personCount:0,latencyMs:null,reason:why});
  }
  function expire() {
    if(current&&(options.nowMs()<current.frame.sourceAtMs||options.nowMs()-current.frame.sourceAtMs>500))reset('Face association is stale; collecting fresh confirmations');
  }
  async function infer(frame:FramePacket,epoch:number) {
    busy=true;
    let image:ImageBitmap|null=null;
    try {
      // createImageBitmap starts while the borrowed source is still open.
      image=await (options.clone||createImageBitmap)(frame.image);
      if(disposed||epoch!==generation)return;
      const faces=await adapter!.detect(image,{width:frame.width,height:frame.height,sourceAtMs:frame.sourceAtMs});
      if(disposed||epoch!==generation||gallery.revision!==galleryRevision)return;
      const bindings=tracker!.update(frame,faces,options.nowMs());
      if(!bindings)return;
      let motion:number|null=null;
      const previous=current;
      if(previous&&previous.bindings.length===1&&bindings.length===1&&bindings[0].state==='matched'&&bindings[0].identityEpoch===previous.bindings[0].identityEpoch){
        const before=previous.bindings[0].bounds,after=bindings[0].bounds,dt=(frame.sourceAtMs-previous.frame.sourceAtMs)/1000;
        if(dt>0&&dt<=.5)motion=Math.max(Math.abs(after.x-before.x),Math.abs(after.y-before.y),Math.abs(after.x+after.width-before.x-before.width),Math.abs(after.y+after.height-before.y-before.height))/Math.min(before.width,after.width)/dt;
      }
      current={frame:{runId:frame.runId,seq:frame.seq,sourceAtMs:frame.sourceAtMs},bindings,faces,motion};
      reason=!calibration?'Identity calibration unavailable':faces.length===0?'No face currently visible':bindings.some(b=>b.state==='matched')?'Face association verified':'Identity unknown or awaiting confirmations';
      batch(bindings,frame.sourceAtMs);
      options.onResult?.({bindings,sourceAtMs:frame.sourceAtMs,frameSeq:frame.seq,personCount:faces.length,latencyMs:options.nowMs()-frame.sourceAtMs,reason});
    }catch {
      if(!disposed&&epoch===generation)reset('Face recognition failed; identity unavailable');
    }finally {image?.close();busy=false;}
  }
  return {
    push(frame:FramePacket) {
      if(disposed)return;
      if(frame.runId!==options.context.runId||frame.seq<=lastSeq)return;
      lastSeq=frame.seq;
      if(galleryRevision!==gallery.revision){galleryRevision=gallery.revision;reset('Enrollment changed; collecting fresh confirmations');lastSeq=frame.seq;}
      expire();
      const result=current;
      const binding=result?.bindings.length===1&&result.faces.length===1?result.bindings[0]:null;
      const matched=binding?.state==='matched'&&binding.visitId!==null;
      const age=result?frame.sourceAtMs-result.frame.sourceAtMs:Infinity;
      const usable=!!matched&&age>=0&&age<=500&&result!.frame.seq<=frame.seq;
      const faceSkin:Bounds[]=usable?(result!.faces[0].faceSkin||[]).filter(validBounds).map(b=>({...b})):[];
      options.onFrame?.({frame,binding:usable?binding:null,faceSkin,identityStamp:usable?{frameSeq:result!.frame.seq,sourceAtMs:result!.frame.sourceAtMs,identityEpoch:binding!.identityEpoch}:null,poseStamp:null,torso:null,selectedPersonCount:result?.faces.length||0,poseMotion:null,faceMotionWidthsPerSecond:usable?result!.motion:null,associationUsable:usable,invalidReason:usable?null:reason});
      if(adapter&&!busy&&frame.sourceAtMs-lastAttempt>=200){lastAttempt=frame.sourceAtMs;void infer(frame,generation);}
    },
    reset,expire,
    dispose(){if(disposed)return;reset('Vision view closed');disposed=true;},
  };
}
