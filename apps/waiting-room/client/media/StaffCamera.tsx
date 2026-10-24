import { useEffect, useRef, useState } from 'react';
import type { RoomSnapshot } from '../../shared/contracts.ts';
import { createCameraTransport } from './transport.ts';
import type { MediaState } from './transport.ts';
import type { CameraSource } from './protocol.ts';
import { createFrameLiveness } from './liveness.ts';
import { cameraOverlays } from './overlays.ts';
import './media.css';

type Received={stream:MediaStream;source:CameraSource|null};
type Display={phase:'waiting'|'live'|'stale';reason:string;width:number;height:number};
const waiting:Display={phase:'waiting',reason:'Waiting for fresh frames from Vision.',width:0,height:0};

/** Authenticated subscriber to Vision's stream. Never calls getUserMedia. */
export function StaffCamera({room,selectedPatientId,selectedRequestId}:{room:RoomSnapshot;selectedPatientId:string|null;selectedRequestId:string|null}) {
  const [state,setState]=useState<MediaState>({phase:'connecting',reason:'Checking staff access for camera sharing…'});
  const [received,setReceived]=useState<Received|null>(null),[display,setDisplay]=useState<Display>(waiting),[retry,setRetry]=useState(0);
  const [snapshotAge,setSnapshotAge]=useState(0);
  const video=useRef<HTMLVideoElement>(null),transport=useRef<ReturnType<typeof createCameraTransport>|null>(null);
  const snapshotAt=useRef(performance.now());
  useEffect(()=>{snapshotAt.current=performance.now();setSnapshotAge(0);},[room]);
  useEffect(()=>{const timer=setInterval(()=>setSnapshotAge(Math.max(0,performance.now()-snapshotAt.current)),200);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    let mounted=true,halted=false;
    setReceived(null);setDisplay(waiting);
    const next=createCameraTransport({role:'receiver',onState:value=>{if(mounted&&!halted)setState(value);},onStream:(stream,source)=>{if(mounted){setReceived(stream?{stream,source}:null);if(stream&&!halted)setDisplay(waiting);}}});
    transport.current=next;
    const hide=()=>{if(document.visibilityState==='hidden'){halted=true;setReceived(null);setDisplay({...waiting,phase:'stale',reason:'Staff view paused while hidden. Reconnect on return.'});setState({phase:'off',reason:'Staff view paused while hidden.'});void next.close();}};
    document.addEventListener('visibilitychange',hide);
    if(document.visibilityState==='hidden')hide();else void next.start();
    return()=>{mounted=false;document.removeEventListener('visibilitychange',hide);if(transport.current===next)transport.current=null;void next.close();};
  },[retry]);
  useEffect(()=>{
    const element=video.current;if(!element||!received)return;
    let disposed=false,callback:number|undefined;const liveness=createFrameLiveness(),startAt=performance.now();
    let dimensions={width:0,height:0};
    const expire=(reason:string)=>{
      if(disposed)return;disposed=true;setDisplay({...dimensions,phase:'stale',reason});
      element.pause();element.srcObject=null;void transport.current?.close();
    };
    element.srcObject=received.stream;
    const fresh=(count:number,width:number,height:number)=>{
      if(disposed||document.visibilityState==='hidden'||!received.stream.getVideoTracks().some(t=>t.readyState==='live'))return;
      if(!(width>0&&height>0)||!liveness.frame(count,performance.now()))return;
      dimensions={width,height};setDisplay({...dimensions,phase:'live',reason:'Live · same Vision camera'});
    };
    const frame:VideoFrameRequestCallback=(_time,metadata)=>{
      fresh(metadata.presentedFrames,metadata.width,metadata.height);
      if(!disposed)callback=element.requestVideoFrameCallback(frame);
    };
    if(typeof element.requestVideoFrameCallback==='function')callback=element.requestVideoFrameCallback(frame);
    else if(typeof element.getVideoPlaybackQuality!=='function')expire('This browser cannot verify fresh shared video frames.');
    const timer=setInterval(()=>{
      if(disposed)return;
      if(typeof element.requestVideoFrameCallback!=='function')fresh(element.getVideoPlaybackQuality().totalVideoFrames,element.videoWidth,element.videoHeight);
      const current=liveness.read(performance.now());
      if(current.phase==='stale')expire('Shared video is stale. The frozen image has been cleared.');
      else if(current.phase==='waiting'&&performance.now()-startAt>5000)expire('No fresh shared video frames arrived.');
    },200);
    const error=()=>expire('Shared video playback failed. Reconnect the camera view.');
    element.addEventListener('error',error);
    void element.play().catch(()=>expire('Video playback needs permission. Reconnect to try again.'));
    return()=>{disposed=true;clearInterval(timer);element.removeEventListener('error',error);if(callback!==undefined&&typeof element.cancelVideoFrameCallback==='function')element.cancelVideoFrameCallback(callback);element.pause();element.srcObject=null;};
  },[received]);
  const isLive=display.phase==='live'&&received!==null&&state.phase==='receiving';
  const overlays=isLive&&snapshotAge<=1500?cameraOverlays({...room,serverNowMs:room.serverNowMs+snapshotAge},received.source,selectedPatientId,selectedRequestId):[];
  const selected=overlays.find(o=>o.selected);
  const hasSelection=selectedPatientId!==null||selectedRequestId!==null;
  const reason=display.phase==='stale'?display.reason:isLive?'Live · same Vision camera':state.phase==='receiving'?display.reason:state.reason;
  return <section className="wr-media" aria-label="Shared room camera">
    <div className="wr-media-status" role="status" aria-live="polite"><span className={isLive?'wr-media-dot wr-media-dot-live':'wr-media-dot'}/><strong>{reason}</strong></div>
    <div className="wr-media-stage">
      <video ref={video} muted autoPlay playsInline aria-label="Shared Vision camera feed" className={isLive?'wr-media-video':'wr-media-video wr-media-not-live'}/>
      {isLive&&display.width>0&&<svg className="wr-media-overlay" viewBox={`0 0 ${display.width} ${display.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Current camera tracks">
        {overlays.map(o=>{const x=o.bounds.x*display.width,y=o.bounds.y*display.height,w=o.bounds.width*display.width,h=o.bounds.height*display.height;
          return <g key={o.trackId} className={o.selected?'wr-media-track-selected':o.verified?'wr-media-track':'wr-media-track-uncertain'}><rect x={x} y={y} width={w} height={h} rx={4} vectorEffect="non-scaling-stroke"/><text x={Math.max(4,x)} y={Math.max(24,y-8)} fontSize={Math.max(18,display.width/45)}>{o.label}</text></g>;})}
      </svg>}
      {!isLive&&<div className="wr-media-empty"><span>Vision → Staff</span><p>{display.phase==='stale'?'No live image is displayed.':'Waiting for the single camera owner.'}</p><p>Open Vision in a foreground tab and start its camera with consent. This view does not open another camera.</p></div>}
    </div>
    {isLive&&selected&&<p className="wr-media-selection">Selected: {selected.label} · {selected.location}</p>}
    {isLive&&hasSelection&&!selected&&<p className="wr-media-warning">No uniquely verified current track for this selection. The camera does not identify the selected patient with confidence.</p>}
    {isLive&&!received.source&&<p className="wr-media-warning">Camera source association is unavailable. Patient overlays are hidden.</p>}
    {isLive&&snapshotAge>1500&&<p className="wr-media-warning">Room identity data is stale. Patient overlays are hidden.</p>}
    <p className="wr-media-caption">Same-origin laptop tabs · direct WebRTC video · no recording or cloud relay. Backgrounding Vision pauses its camera.</p>
    {!isLive&&<button type="button" className="wr-media-reconnect" onClick={()=>setRetry(value=>value+1)}>Reconnect shared camera</button>}
  </section>;
}
