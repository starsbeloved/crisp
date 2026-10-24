import { useEffect, useRef, useState } from 'react';
import { createCameraController } from './camera.ts';
import { useVisionResources } from './resources.tsx';
import type { CalibrationCaptures } from './session-store.ts';
const stages=['reference','genuine','unknown'] as const;
const labels={reference:'Capture reference person',genuine:'Capture same person again',unknown:'Capture different person'};
export function FaceCalibration(){
  const resources=useVisionResources(),latest=useRef(resources);latest.current=resources;
  const video=useRef<HTMLVideoElement>(null),camera=useRef<ReturnType<typeof createCameraController>|null>(null),captures=useRef<CalibrationCaptures>({reference:[],genuine:[],unknown:[]}),stageRef=useRef<(typeof stages)[number]>('reference');
  const [stage,setStage]=useState<(typeof stages)[number]>('reference'),[count,setCount]=useState(0),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[agreed,setAgreed]=useState(false),[message,setMessage]=useState<string|null>(null);
  useEffect(()=>{
    if(!video.current||!resources.adapter)return;let mounted=true,generation=0,inFlight=false,last=-Infinity;
    const controller=createCameraController({video:video.current,runId:'face-calibration',nowMs:()=>performance.timeOrigin+performance.now(),onStatus:s=>{if(mounted&&!['live','starting','requesting'].includes(s.state)){setBusy(false);if(s.reason)setMessage(s.reason);}},onReset:()=>{generation++;last=-Infinity;},onFrame:frame=>{
      if(inFlight||frame.sourceAtMs-last<250)return;last=frame.sourceAtMs;inFlight=true;const epoch=generation;
      void(async()=>{let image:ImageBitmap|null=null;
        try{image=await createImageBitmap(frame.image);const faces=await latest.current.adapter!.detect(image,{width:frame.width,height:frame.height,sourceAtMs:frame.sourceAtMs});
          if(!mounted||epoch!==generation)return;
          if(performance.timeOrigin+performance.now()-frame.sourceAtMs>500){setMessage('Face processing took too long. Improve framing or close other heavy apps, then retry.');return;}
          if(faces.length!==1||!faces[0].usable){setMessage(faces.length!==1?'Keep exactly one consenting person in frame.':faces[0].reason);return;}
          const target=captures.current[stageRef.current];target.push([...faces[0].descriptor]);setCount(target.length);
          if(target.length>=3){const done=stageRef.current;controller.stop();setBusy(false);
            if(done==='unknown'){setSaving(true);setMessage('Checking captured distributions…');const snapshot=structuredClone(captures.current);try{await latest.current.session!.saveCalibration(snapshot);}finally{if(mounted)setSaving(false);}if(mounted){setMessage('Calibration saved from these captures. Enroll the patient next.');captures.current={reference:[],genuine:[],unknown:[]};setStage('reference');stageRef.current='reference';setCount(0);}}
            else{const next=done==='reference'?'genuine':'unknown';stageRef.current=next;setStage(next);setCount(0);setMessage(done==='reference'?'Ask the same person to turn slightly, then face the camera again.':'Ask that person to leave the frame. A different consenting person must now enter.');}
          }
        }catch(e){if(mounted){controller.stop();setMessage(e instanceof Error?e.message:'Calibration failed');}}
        finally{image?.close();inFlight=false;}
      })();
    }});camera.current=controller;return()=>{mounted=false;generation++;controller.dispose();camera.current=null;};
  },[resources.adapter]);
  function start(){captures.current[stageRef.current]=[];setCount(0);setMessage(null);setBusy(true);void camera.current?.start();}
  return <section className="vision-calibration" aria-label="Face calibration"><h3>Calibrate for this session</h3><p>Three steps use distinct real captures. Step 2 must be the same person; step 3 must be someone else. The app cannot independently verify this instruction. Stop the room monitoring camera before calibration; both use the same exclusive camera lease.</p><label><input type="checkbox" checked={agreed} disabled={busy||saving} onChange={e=>setAgreed(e.target.checked)}/> Both volunteers consent to these calibration captures.</label>
    <video ref={video} autoPlay muted playsInline aria-label="Calibration camera"/>
    <p role="status">{message||`${labels[stage]} · ${count}/3 usable captures`}</p>
    <div className="vision-controls"><button type="button" disabled={!agreed||busy||saving} onClick={start}>{labels[stage]}</button><button type="button" disabled={!busy} onClick={()=>{camera.current?.stop();setBusy(false);captures.current[stageRef.current]=[];setCount(0);}}>Stop calibration</button><button type="button" disabled={busy||saving} onClick={()=>{camera.current?.stop();captures.current={reference:[],genuine:[],unknown:[]};stageRef.current='reference';setStage('reference');setCount(0);setMessage('Calibration restarted. Begin with the reference person.');}}>Restart calibration</button></div>
    <p className="vision-secondary">Calibration failure never installs a default threshold. Recalibration clears previous session enrollments; reenroll each intended visit.</p>
  </section>;
}
