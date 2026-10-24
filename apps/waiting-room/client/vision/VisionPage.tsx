import { useEffect, useRef, useState } from 'react';
import type { BindingBatch, BindingInput, BoundFrame, SensorContext } from '../../shared/contracts.ts';
import { createCameraController } from './camera.ts';
import type { CameraStatus } from './camera.ts';
import { createVisionRuntime } from './runtime.ts';
import type { VisionResult } from './runtime.ts';
import { useVisionResources } from './resources.tsx';
import './vision.css';
import { IdentitySetup } from './IdentitySetup.tsx';

export type VisionPageProps={onStream?:(stream:MediaStream|null)=>void;onBindings?:(batch:BindingBatch)=>void;onFrame?:(frame:BoundFrame)=>void;context:SensorContext;nowMs:()=>number};
export function TrackOverlay({bindings,width,height,selectedTrackId}:{bindings:readonly BindingInput[];width:number;height:number;selectedTrackId?:string|null}) {
  if(width<=0||height<=0)return null;
  return <svg className="vision-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Current camera track locations">
    {bindings.map(b=><g key={b.trackId} className={`vision-track vision-track--${b.state}${selectedTrackId===b.trackId?' vision-track--selected':''}`}>
      <rect x={b.bounds.x*width} y={b.bounds.y*height} width={b.bounds.width*width} height={b.bounds.height*height} rx="5" vectorEffect="non-scaling-stroke"/>
      <text x={b.bounds.x*width+6} y={Math.max(18,b.bounds.y*height-8)}>{b.visitId?`Visit ${b.visitId}`:b.state==='unknown'?'Unknown person':'Identity uncertain'}</text>
    </g>)}
  </svg>;
}
const initialStatus:CameraStatus={state:'off',reason:null,width:0,height:0};
const statusLabel=(status:CameraStatus)=>({off:'Camera off',requesting:'Requesting camera permission',starting:'Waiting for video',live:'Live camera',stale:'Camera paused · stale',unavailable:'Camera unavailable'})[status.state];
export function VisionPage(props:VisionPageProps) {
  const resources=useVisionResources(),latest=useRef(props);latest.current=props;
  const video=useRef<HTMLVideoElement>(null),camera=useRef<ReturnType<typeof createCameraController>|null>(null);
  const [status,setStatus]=useState(initialStatus),[selected,setSelected]=useState<string|null>(null);
  const [result,setResult]=useState<VisionResult>({bindings:[],sourceAtMs:null,frameSeq:null,personCount:0,latencyMs:null,reason:resources.adapter?'Collecting face confirmations':'Face recognition model unavailable'});
  useEffect(()=>{
    if(!video.current)return;
    let mounted=true;
    const context:SensorContext={sourceId:props.context.sourceId,runId:props.context.runId,getSyncId:()=>latest.current.context.getSyncId(),nextSeq:()=>latest.current.context.nextSeq()};
    const runtime=createVisionRuntime({context,resources,nowMs:()=>latest.current.nowMs(),onBindings:b=>latest.current.onBindings?.(b),onFrame:f=>latest.current.onFrame?.(f),onResult:r=>{if(mounted)setResult(r);}});
    const controller=createCameraController({video:video.current,runId:context.runId,nowMs:()=>latest.current.nowMs(),onFrame:f=>runtime.push(f),onStatus:s=>{if(mounted)setStatus(s);},onStream:s=>latest.current.onStream?.(s),onReset:reason=>runtime.reset(reason)});
    camera.current=controller;
    const timer=setInterval(()=>runtime.expire(),200);
    return ()=>{mounted=false;clearInterval(timer);controller.dispose();runtime.dispose();camera.current=null;};
  },[props.context.sourceId,props.context.runId,resources.adapter,resources.gallery,resources.calibration,resources.regions]);
  const current=status.state==='live'?result.bindings:[];
  const selectedBinding=current.find(b=>b.trackId===selected)||null;
  const active=['requesting','starting','live'].includes(status.state);
  return <main className="vision-page">
    <header className="vision-header"><div><p className="vision-eyebrow">Waiting room / camera station</p><h1>Room vision</h1><p>Observe the room. Keep each visit connected to verified evidence.</p></div>
      <div className="vision-controls"><span className={`vision-status vision-status--${status.state}`} role="status">{statusLabel(status)}</span><button type="button" className="vision-primary" onClick={()=>{void camera.current?.start();}} disabled={active}>Start camera</button><button type="button" onClick={()=>camera.current?.stop()} disabled={!active}>Stop</button></div>
    </header>
    <div className="vision-layout"><section className="vision-camera-panel" aria-label="Room camera">
      <div className="vision-camera-head"><span>Camera 01 · foreground station</span><span>{status.width>0?`${status.width} × ${status.height}`:'No video frames'}</span></div>
      <div className="vision-stage"><video ref={video} autoPlay muted playsInline aria-label="Local room camera video"/>
        <TrackOverlay bindings={current} width={status.width} height={status.height} selectedTrackId={selected}/>
        {status.state!=='live'&&<div className="vision-camera-placeholder"><svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="5" y="10" width="28" height="28" rx="7" stroke="currentColor" strokeWidth="2"/><path d="m33 19 10-5v20l-10-5" stroke="currentColor" strokeWidth="2"/></svg><h2>{statusLabel(status)}</h2><p>{status.reason||'Start the camera when the consenting volunteer is ready.'}</p></div>}
      </div><footer className="vision-camera-foot"><span>{status.state==='live'?'Local video · no recording':'Monitoring is paused'}</span><span>{current.length} current {current.length===1?'track':'tracks'}</span></footer>
    </section>
    <aside className="vision-sidebar" aria-label="Track details"><IdentitySetup/><section className="vision-card"><div className="vision-section-title"><h2>Current tracks</h2><span>{current.length.toString().padStart(2,'0')}</span></div>
      {current.length===0?<div className="vision-empty"><p>No current tracks</p><span>Verified tracks appear here when recognition is available and the person is visible.</span></div>:<ul className="vision-track-list">{current.map((b,index)=><li key={b.trackId}><button type="button" onClick={()=>setSelected(b.trackId)} aria-pressed={selected===b.trackId}><span className="vision-track-number">{(index+1).toString().padStart(2,'0')}</span><span><strong>{b.visitId?`Visit ${b.visitId}`:b.state==='unknown'?'Unknown person':'Identity uncertain'}</strong><small>{b.observedLocation?.label||'Current location unverified'}</small></span><span className="vision-track-state">{b.state}</span></button></li>)}</ul>}
      {selectedBinding&&<div className="vision-selection"><h3>Selected track</h3><dl><dt>Track</dt><dd>{selectedBinding.trackId}</dd><dt>Visit</dt><dd>{selectedBinding.visitId||'Unassigned'}</dd><dt>Observed location</dt><dd>{selectedBinding.observedLocation?.label||'Unverified'}</dd></dl></div>}
    </section><section className="vision-card"><h2>Recognition</h2><p className="vision-capability">{!resources.adapter?'Face recognition model unavailable':!resources.calibration?'Identity calibration unavailable':result.reason}</p><p className="vision-secondary">{resources.adapter&&result.latencyMs!==null?`Last inference: ${Math.round(result.latencyMs)} ms. `:''}Ambiguous faces stay unassigned. Assigned seats do not establish identity.</p></section>
    <section className="vision-card vision-note"><h2>One camera, one view</h2><p>Keep this view in the foreground. Switching to check-in pauses monitoring and starts fresh observation windows.</p><p>Staff requests and patient readings are shown in the staff dashboard.</p></section></aside></div>
  </main>;
}
