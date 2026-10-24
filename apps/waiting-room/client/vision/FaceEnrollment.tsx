import { useEffect, useRef, useState } from 'react';
import { createCameraController } from './camera.ts';
import type { CameraStatus } from './camera.ts';
import { createEnrollmentSession } from './identity.ts';
import { useVisionResources } from './resources.tsx';
import type { EnrollmentReceipt } from './types.ts';
import './vision.css';

export type FaceEnrollmentProps={visitId:string;nowMs:()=>number;onEnrolled?:(receipt:EnrollmentReceipt)=>void;onBusy?:(busy:boolean)=>void};
/** Camera starts only through the user's explicit Start face scan action. */
export function FaceEnrollment(props:FaceEnrollmentProps) {
  const resources=useVisionResources(),latest=useRef(props),latestResources=useRef(resources);latest.current=props;latestResources.current=resources;
  const video=useRef<HTMLVideoElement>(null),camera=useRef<ReturnType<typeof createCameraController>|null>(null);
  const [status,setStatus]=useState<CameraStatus['state']>('off'),[count,setCount]=useState(0),[saved,setSaved]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState<string|null>(null);
  const calibrated=resources.calibration?.modelId===resources.adapter?.modelId && !!resources.calibration;
  const available=!!resources.adapter&&calibrated;
  useEffect(()=>{
    if(!video.current)return;
    let mounted=true,generation=0,busy=false,lastAtMs=-Infinity;
    const adapter=resources.adapter;
    const newSession=()=>adapter&&calibrated?createEnrollmentSession(props.visitId,adapter.modelId,{similarity:(a,b)=>adapter.similarity(a,b),threshold:resources.calibration!.threshold}):null;
    let session=newSession();
    setCount(0);setSaved(false);setSaving(false);setMessage(null);
    const controller=createCameraController({video:video.current,runId:`enroll_${props.visitId}`,nowMs:()=>latest.current.nowMs(),onStatus:s=>{if(mounted){setStatus(s.state);if(s.reason)setMessage(s.reason);}},onReset:()=>{generation++;lastAtMs=-Infinity;session=newSession();if(mounted)setCount(0);},onFrame:frame=>{
      if(!adapter||!session||busy||frame.sourceAtMs-lastAtMs<200)return;
      lastAtMs=frame.sourceAtMs;busy=true;
      const epoch=generation;
      // Begin cloning synchronously while the producer's borrowed bitmap is open.
      void (async()=>{
        let image:ImageBitmap|null=null;
        try {
          image=await createImageBitmap(frame.image);
          if(!mounted||epoch!==generation)return;
          const faces=await adapter.detect(image,{width:frame.width,height:frame.height,sourceAtMs:frame.sourceAtMs});
          if(!mounted||epoch!==generation)return;
          if(latest.current.nowMs()-frame.sourceAtMs>500||latest.current.nowMs()<frame.sourceAtMs){setMessage('Face processing was too slow or its clock changed. Hold still and try again; no stale scan was saved.');return;}
          const result=session!.add(frame,faces);setCount(result.count);setMessage(result.reason);
          const enrollment=session!.finish();
          if(enrollment){
            controller.stop();
            const commitEpoch=generation;setSaving(true);setMessage('Saving face scan…');
            try{await latestResources.current.saveEnrollment?.(enrollment);}
            catch(error){if(mounted&&commitEpoch===generation)setMessage(error instanceof Error?error.message:'Face scan save failed. Please try again.');return;}
            finally{if(mounted)setSaving(false);}
            if(!mounted||commitEpoch!==generation)return;
            if(!latestResources.current.saveEnrollment)resources.gallery.enroll(enrollment);
            setSaved(true);setCount(enrollment.samples.length);setMessage('Face scan saved for this visit');
            latest.current.onEnrolled?.({visitId:enrollment.visitId,modelId:enrollment.modelId,sampleCount:enrollment.samples.length,capturedAtMs:enrollment.capturedAtMs});
          }
        }catch {if(mounted&&epoch===generation){controller.stop();setMessage('Face scan failed. Please try again or ask for assistance.');}}
        finally {image?.close();busy=false;}
      })();
    }});
    camera.current=controller;
    return ()=>{mounted=false;generation++;controller.dispose();camera.current=null;};
  },[props.visitId,resources.adapter,resources.gallery,resources.calibration]);
  const active=['requesting','starting','live'].includes(status);
  useEffect(()=>{latest.current.onBusy?.(active||saving);},[active,saving]);
  useEffect(()=>()=>latest.current.onBusy?.(false),[]);
  return <section className="vision-enrollment" aria-label="Face enrollment"><h2>Face scan</h2><p>Keep exactly one person in frame. The scan stays on this station for this session.</p>
    <div className="vision-enrollment-video"><video ref={video} autoPlay playsInline muted aria-label="Face enrollment camera"/>{!active&&<span>{saved?'Face scan saved':available?'Ready to scan':'Face enrollment unavailable'}</span>}</div>
    <p role="status">{message||(!available?'Face enrollment unavailable. A verified recognition model and calibration are required.':active?`Hold still · ${count} of 3 usable captures`:'Start when you are ready.')}</p>
    <div className="vision-controls"><button type="button" className="vision-primary" disabled={!available||active||saved||saving} onClick={()=>{setCount(0);setMessage(null);void camera.current?.start();}}>Start face scan</button><button type="button" disabled={!active} onClick={()=>{camera.current?.stop();setCount(0);}}>Stop scan</button></div>
  </section>;
}
