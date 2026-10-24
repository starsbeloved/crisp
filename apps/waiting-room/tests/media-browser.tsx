import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../client/runtime/api.ts';
import { useCameraPublisher,tagCameraStream } from '../client/media/useCameraPublisher.ts';
import { StaffCamera } from '../client/media/StaffCamera.tsx';
import { emptyRoom } from '../shared/fixtures.ts';

/** Local-only manual/browser proof: moving canvas, no camera, real WebRTC + HTTP auth. */
function SyntheticMediaProof(){
  const pair=new URLSearchParams(location.search).get('role')==='pair';
  const receiver=new URLSearchParams(location.search).get('role')==='receiver';
  const publish=useCameraPublisher(),canvas=useRef<HTMLCanvasElement>(null),stream=useRef<MediaStream|null>(null),draw=useRef<number|null>(null);
  const [enabled,setEnabled]=useState(false),[error,setError]=useState(''),[room,setRoom]=useState(emptyRoom);
  const paintRef=useRef<(()=>void)|null>(null),[frozen,setFrozen]=useState(false);
  const stop=()=>{publish(null);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(draw.current!==null)clearInterval(draw.current);draw.current=null;setEnabled(false);};
  useEffect(()=>()=>{stream.current?.getTracks().forEach(t=>t.stop());if(draw.current!==null)clearInterval(draw.current);},[]);
  useEffect(()=>{if(!enabled||!receiver)return;const timer=setInterval(()=>setRoom({...emptyRoom,serverNowMs:Date.now()}),500);return()=>clearInterval(timer);},[enabled,receiver]);
  async function start(){
    try{await api.startStation();setError('');
      if(!receiver){const element=canvas.current!,ctx=element.getContext('2d')!;let frame=0;
        const paint=()=>{ctx.fillStyle='#123';ctx.fillRect(0,0,640,360);ctx.fillStyle='#8ed6a8';ctx.fillRect((frame*7)%580,160,60,60);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText(`SYNTHETIC CANVAS ${frame++}`,24,40);};paintRef.current=paint;paint();draw.current=window.setInterval(paint,66);setFrozen(false);
        const next=element.captureStream(15);stream.current=next;tagCameraStream(next,{sourceId:'synthetic_camera',runId:'synthetic_run'});publish(next);
      }setEnabled(true);
    }catch(e){setError(e instanceof Error?e.message:'Failed');}
  }
  if(pair)return <main style={{fontFamily:'system-ui'}}><h1>Synthetic two-document WebRTC proof</h1><p>Two visible same-origin documents. Moving canvas only; no webcam or recording.</p><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}><iframe title="Synthetic publisher" src="/tests/media-browser.html" style={{width:'100%',height:800}}/><iframe title="Synthetic receiver" src="/tests/media-browser.html?role=receiver" style={{width:'100%',height:800}}/></div></main>;
  return <main style={{fontFamily:'system-ui',maxWidth:800,margin:'24px auto'}}><h1>Synthetic media transport proof</h1><p>Moving canvas only. No webcam, biometric data, provider call or recording.</p><h2>{receiver?'Receiver':'Publisher'}</h2>{error&&<p role="alert">{error}</p>}
    {!enabled?<button onClick={()=>void start()}>Start synthetic {receiver?'receiver':'publisher'}</button>:<button onClick={stop}>Stop synthetic {receiver?'receiver':'publisher'}</button>}
    {enabled&&!receiver&&<button onClick={()=>{if(draw.current!==null){clearInterval(draw.current);draw.current=null;setFrozen(true);}else{draw.current=window.setInterval(()=>paintRef.current?.(),66);setFrozen(false);}}}>{frozen?'Resume synthetic frames':'Freeze synthetic frames'}</button>}
    {!receiver&&<canvas ref={canvas} width={640} height={360} style={{width:'100%'}}/>}
    {enabled&&receiver&&<StaffCamera room={room} selectedPatientId={null} selectedRequestId={null}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<SyntheticMediaProof/>);
