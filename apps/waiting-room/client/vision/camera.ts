import type { FramePacket } from '../../shared/contracts.ts';

export type CameraStatus={state:'off'|'requesting'|'starting'|'live'|'stale'|'unavailable';reason:string|null;width:number;height:number};
export type CameraEnvironment={
  getUserMedia:()=>Promise<MediaStream>;
  snapshot:(video:HTMLVideoElement)=>Promise<ImageBitmap>;
  requestFrame:(callback:FrameRequestCallback)=>number;
  cancelFrame:(id:number)=>void;
  watch:(callback:()=>void)=>()=>void;
  monotonicMs:()=>number;
  decodedFrameId?:(video:HTMLVideoElement)=>number;
  acquireLease?:()=>Promise<(()=>void)|null>;
  visibility?:Document;
};
let owner:symbol|null=null;
function browserEnvironment(video:HTMLVideoElement):CameraEnvironment {
  const nativeFrames=typeof video.requestVideoFrameCallback==='function';
  let presentedFrames=0;
  return {
    acquireLease:()=>new Promise(resolve=>{
      if(!navigator.locks?.request){resolve(null);return;}
      void navigator.locks.request('waiting-room-foreground-camera',{ifAvailable:true},lock=>{
        if(!lock){resolve(null);return;}
        return new Promise<void>(release=>{resolve(release);});
      }).catch(()=>resolve(null));
    }),
    getUserMedia:()=>{
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('Camera requires a secure context and browser support'));
      return navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}}});
    },
    snapshot:video=>createImageBitmap(video),
    requestFrame:cb=>nativeFrames?video.requestVideoFrameCallback((time,metadata)=>{presentedFrames=metadata.presentedFrames;cb(time);}):requestAnimationFrame(cb),
    cancelFrame:id=>{if(nativeFrames)video.cancelVideoFrameCallback(id);else cancelAnimationFrame(id);},
    decodedFrameId:video=>nativeFrames?presentedFrames:video.getVideoPlaybackQuality?.().totalVideoFrames??NaN,
    watch:cb=>{const id=setInterval(cb,200);return ()=>clearInterval(id);},monotonicMs:()=>performance.now(),visibility:document,
  };
}
/** Owns exactly one foreground webcam. onFrame borrows each bitmap synchronously;
 * sample/copy within the callback; this producer closes it in finally.
 */
export function createCameraController(options:{video:HTMLVideoElement;runId:string;nowMs:()=>number;onFrame:(frame:FramePacket)=>void;onStatus:(status:CameraStatus)=>void;onStream?:(stream:MediaStream|null)=>void;onReset?:(reason:string)=>void;environment?:CameraEnvironment}) {
  const env=options.environment||browserEnvironment(options.video),token=Symbol('foreground-camera');
  let generation=0,disposed=false,stream:MediaStream|null=null,raf:number|null=null,unwatch:(()=>void)|null=null,releaseLease:(()=>void)|null=null;
  let seq=0,lastDecodedAtMs=0,lastMediaTime=-1,lastDecodedId=-1,snapshotBusy=false;
  let tracks:MediaStreamTrack[]=[];
  let status:CameraStatus={state:'off',reason:null,width:0,height:0};
  const report=(state:CameraStatus['state'],reason:string|null=null)=>{status={state,reason,width:options.video.videoWidth||0,height:options.video.videoHeight||0};options.onStatus(status);};
  const trackLost=()=>stop('unavailable','Camera disconnected or interrupted');
  const hidden=()=>{if(env.visibility?.hidden && owner===token)stop('stale','Monitoring paused while this view is in the background');};
  function stop(state:CameraStatus['state']='off',reason:string|null=null) {
    generation++;
    if (raf!==null)env.cancelFrame(raf);raf=null;unwatch?.();unwatch=null;
    tracks.forEach(track=>{track.removeEventListener('ended',trackLost);track.removeEventListener('mute',trackLost);track.stop();});tracks=[];
    stream=null;options.video.pause();options.video.srcObject=null;
    if(owner===token)owner=null;
    releaseLease?.();releaseLease=null;
    env.visibility?.removeEventListener('visibilitychange',hidden);
    options.onStream?.(null);options.onReset?.(reason||'Camera stopped');
    report(state,reason);
  }
  async function capture(epoch:number) {
    if(disposed || epoch!==generation || !stream)return;
    raf=env.requestFrame(()=>{void capture(epoch);});
    const video=options.video;
    const decodedId=env.decodedFrameId?env.decodedFrameId(video):video.currentTime;
    if (video.readyState<2 || video.videoWidth<=0 || video.videoHeight<=0 || !Number.isFinite(decodedId) || decodedId===lastDecodedId)return;
    const sourceAtMs=options.nowMs(),monotonicMs=env.monotonicMs(),width=video.videoWidth,height=video.videoHeight;
    if(video.currentTime<lastMediaTime) {stop('stale','Video timing restarted; start a fresh monitoring window');return;}
    lastMediaTime=video.currentTime;lastDecodedId=decodedId;lastDecodedAtMs=sourceAtMs;
    if(status.state==='live'&&(status.width!==width||status.height!==height)){
      options.onReset?.('Camera resolution changed; fresh observation windows');report('live');
    }
    if(status.state!=='live')report('live');
    if(snapshotBusy)return;
    snapshotBusy=true;
    let image:ImageBitmap|null=null;
    try {
      image=await env.snapshot(video);
      if(disposed||epoch!==generation||options.nowMs()<sourceAtMs||options.nowMs()-sourceAtMs>500)return;
      options.onFrame({runId:options.runId,seq:++seq,sourceAtMs,monotonicMs,width,height,image});
    } catch {
      if(epoch===generation&&!disposed)stop('unavailable','Camera frame processing failed; start again');
    } finally {image?.close();snapshotBusy=false;}
  }
  return {
    async start() {
      if(disposed||owner===token)return;
      if(owner) {report('unavailable','Camera is already in use by enrollment or another Vision view');return;}
      owner=token;
      const epoch=++generation;
      report('requesting');
      try {
        if(env.acquireLease){
          const release=await env.acquireLease();
          if(disposed||epoch!==generation){release?.();return;}
          if(!release){stop('unavailable','Camera ownership could not be reserved. Close the other camera view, or use a browser with Web Locks support.');return;}
          releaseLease=release;
        }
        const acquired=await env.getUserMedia();
        if(disposed||epoch!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
        stream=acquired;tracks=stream.getTracks();
        tracks.forEach(t=>{t.addEventListener('ended',trackLost);t.addEventListener('mute',trackLost);});
        options.video.srcObject=stream;
        await options.video.play();
        if(disposed||epoch!==generation)return;
        if(env.visibility?.hidden) {stop('stale','Open this view in the foreground to use the camera');return;}
        options.onStream?.(stream);options.onReset?.('Camera started; fresh observation windows');
        lastDecodedAtMs=options.nowMs();lastMediaTime=-1;lastDecodedId=-1;
        report('starting');
        env.visibility?.addEventListener('visibilitychange',hidden);
        unwatch=env.watch(()=>{if(options.nowMs()-lastDecodedAtMs>1000)stop('stale','No new video frame for over one second');});
        raf=env.requestFrame(()=>{void capture(epoch);});
      }catch(error) {
        if(epoch===generation&&!disposed)stop('unavailable',error instanceof DOMException&&error.name==='NotAllowedError'?'Camera permission was denied. Allow access and try again.':error instanceof Error?error.message:'Camera could not start');
      }
    },
    stop:()=>stop(),
    dispose(){if(disposed)return;stop();disposed=true;},
  };
}
