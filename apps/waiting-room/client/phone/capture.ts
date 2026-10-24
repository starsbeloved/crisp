import type { TimedRGB } from '../../shared/contracts.ts';

type OpticalFrame = {sample:Omit<TimedRGB,'tMs'>; eligible:boolean; reason:string|null};
export type CaptureProgress = {eligible:boolean; reason:string|null; usableMs:number; sampleCount:number};
export type PhoneCaptureHandle = {stop():Promise<void>; done:Promise<string>};
type CaptureOptions = {signal?:AbortSignal; onStatus?:(status:CaptureProgress)=>void; sourceNow?:()=>number};

/** Conservative prototype image gates. These do not prove skin contact universally. */
export function inspectContactFrame(data:Uint8ClampedArray, previous?:Uint8ClampedArray):OpticalFrame {
  const count=data.length/4, sum=[0,0,0], clipped=[0,0,0];
  let coverage=0,movement=0,brightnessSquare=0;
  for(let i=0;i<data.length;i+=4){
    const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
    for(let c=0;c<3;c++){sum[c]+=data[i+c]/255;if(data[i+c]<=1||data[i+c]>=254)clipped[c]++;}
    if(r>0.22&&r>g*1.15&&r>b*1.15)coverage++;
    brightnessSquare+=((r+g+b)/3)**2;
    if(previous?.length===data.length)for(let c=0;c<3;c++)movement+=Math.abs(data[i+c]-previous[i+c])/255;
  }
  const [r,g,b]=sum.map(v=>v/count), saturationFraction={r:clipped[0]/count,g:clipped[1]/count,b:clipped[2]/count};
  const sample={r,g,b,saturationFraction};
  if(!count||!Number.isFinite(r))return {sample,eligible:false,reason:'No optical image available'};
  const brightness=(r+g+b)/3,texture=Math.sqrt(Math.max(0,brightnessSquare/count-brightness**2));
  let reason:string|null=null;
  if(Object.values(saturationFraction).every(v=>v>=0.05))reason='All optical channels are saturated';
  else if(coverage/count<0.85||brightness<0.06||texture>0.16)reason='Finger coverage uncertain — gently cover the rear lens and light';
  else if(previous&&movement/(count*3)>0.06)reason='Finger movement — hold gently still';
  return {sample,eligible:reason===null,reason};
}

/** Exact frozen public entry point. UI uses openPhoneCapture for cancellation/status. */
export async function startPhoneCapture(video:HTMLVideoElement,onSample:(sample:TimedRGB)=>void):Promise<{stop():Promise<void>}> {
  return openPhoneCapture(video,onSample);
}
export async function openPhoneCapture(video:HTMLVideoElement,onSample:(sample:TimedRGB)=>void,options:CaptureOptions={}):Promise<PhoneCaptureHandle> {
  if(!globalThis.isSecureContext)throw Error('Trusted HTTPS is required for the phone camera');
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera capture is unsupported in this browser');
  if(document.hidden)throw Error('Keep this page in the foreground');
  let stream:MediaStream|null=null,track:MediaStreamTrack|null=null,stopped=false,torchRequested=false;
  let frameId:number|null=null,rafId:number|null=null,lastMediaTime=-1,previous:Uint8ClampedArray|undefined;
  let stableSince:number|null=null,firstEligible:number|null=null,lastSample:number|null=null,lastDecodedAt:number|null=null,sampleCount=0;
  const monoAnchor=performance.now(),wallAnchor=Date.now();
  let finish!:(reason:string)=>void;
  const done=new Promise<string>(resolve=>{finish=resolve;});
  const sourceNow=options.sourceNow??(()=>wallAnchor+(performance.now()-monoAnchor));
  let cleanupPromise:Promise<void>|null=null;
  const stop=(reason='Stopped by user'):Promise<void>=>{
    if(cleanupPromise)return cleanupPromise;
    stopped=true;
    clearTimeout(deadline);
    document.removeEventListener('visibilitychange',hidden);
    window.removeEventListener('pagehide',pagehide);
    options.signal?.removeEventListener('abort',aborted);
    if(frameId!==null)video.cancelVideoFrameCallback?.(frameId);
    if(rafId!==null)cancelAnimationFrame(rafId);
    track?.removeEventListener('ended',ended);
    // Request light-off, then release hardware synchronously even if a browser's
    // applyConstraints promise stalls. stop() itself must remain immediate.
    let off:Promise<void>=Promise.resolve();
    if(torchRequested&&track){try{off=track.applyConstraints({advanced:[{torch:false} as MediaTrackConstraintSet]}).catch(()=>{});}catch{ /* tracks still stop below */ }}
    stream?.getTracks().forEach(t=>t.stop());
    video.pause();video.srcObject=null;previous=undefined;
    finish(reason);
    // Do not wait for an unresponsive driver to acknowledge torch-off.
    void off;
    cleanupPromise=Promise.resolve();return cleanupPromise;
  };
  const hidden=()=>{if(document.hidden)void stop('Capture interrupted by backgrounding');};
  const pagehide=()=>{void stop('Capture interrupted by leaving page');};
  const aborted=()=>{void stop('Capture cancelled');};
  const ended=()=>{void stop('Camera track ended');};
  const deadline=setTimeout(()=>{void stop('Maximum 60-second attempt ended');},60000);
  document.addEventListener('visibilitychange',hidden);
  window.addEventListener('pagehide',pagehide);
  options.signal?.addEventListener('abort',aborted,{once:true});
  const assertRunning=()=>{if(stopped||options.signal?.aborted)throw Error('Capture cancelled or stopped');};
  const status=(reason:string|null,eligible=false)=>options.onStatus?.({eligible,reason,usableMs:firstEligible===null||lastSample===null?0:lastSample-firstEligible,sampleCount});
  const reset=(reason:string)=>{stableSince=null;firstEligible=null;lastSample=null;sampleCount=0;status(reason);};
  try {
    assertRunning();
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{exact:'environment'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}}});
    if(stopped||options.signal?.aborted){stream.getTracks().forEach(t=>t.stop());throw Error('Capture cancelled or stopped');}
    track=stream.getVideoTracks()[0];
    if(!track)throw Error('Rear camera track unavailable');
    track.addEventListener('ended',ended,{once:true});
    const settings=track.getSettings();
    if(settings.facingMode!=='environment')throw Error('Rear camera selection cannot be verified');
    const capabilities=track.getCapabilities?.() as (MediaTrackCapabilities&{torch?:boolean})|undefined;
    if(capabilities?.torch!==true)throw Error('Continuous rear-camera flashlight is unsupported');
    torchRequested=true;
    await track.applyConstraints({advanced:[{torch:true} as MediaTrackConstraintSet]});
    assertRunning();
    const torchSetting=(track.getSettings() as MediaTrackSettings&{torch?:boolean}).torch;
    if(torchSetting===false)throw Error('Flashlight could not be enabled');
    video.muted=true;video.playsInline=true;video.srcObject=stream;
    await video.play();assertRunning();
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('Optical image extraction is unavailable');
    const schedule=()=>{
      if(stopped)return;
      if(typeof video.requestVideoFrameCallback==='function')frameId=video.requestVideoFrameCallback((_,metadata)=>process(metadata.mediaTime));
      else rafId=requestAnimationFrame(()=>process(video.currentTime));
    };
    const process=(mediaTime:number)=>{
      if(stopped)return;
      try{
        const now=sourceNow();
        if(Math.abs(Date.now()-now)>1000)throw Error('Device clock changed — start a new capture');
        if(document.hidden){void stop('Capture interrupted by backgrounding');return;}
        if(mediaTime===lastMediaTime){schedule();return;}
        lastMediaTime=mediaTime;
        if(video.readyState<2||video.videoWidth===0||video.videoHeight===0){reset('Waiting for rear-camera frames');schedule();return;}
        ctx.drawImage(video,video.videoWidth*0.3,video.videoHeight*0.3,video.videoWidth*0.4,video.videoHeight*0.4,0,0,64,64);
        const data=ctx.getImageData(0,0,64,64).data;
        const result=inspectContactFrame(data,previous);previous=new Uint8ClampedArray(data);
        if(lastDecodedAt!==null&&now-lastDecodedAt>200)reset('Frame gap over 200 ms — collecting a fresh interval');
        lastDecodedAt=now;
        if(!result.eligible){reset(result.reason!);schedule();return;}
        if(stableSince===null)stableSince=now;
        if(now-stableSince<2000){status('Settling — hold gently still');schedule();return;}
        if(firstEligible===null)firstEligible=now;
        lastSample=now;sampleCount++;
        status(null,true);
        onSample({...result.sample,tMs:now});
        schedule();
      }catch(error){void stop(error instanceof Error?error.message:'Optical extraction failed');}
    };
    status('Verify the rear light is on, then gently cover the lens and light');
    schedule();
    return {stop:()=>stop(),done};
  }catch(error){await stop(error instanceof Error?error.message:'Camera unavailable');throw error;}
}
