// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { VisionPage, TrackOverlay } from '../client/vision/VisionPage.tsx';
import { FaceEnrollment } from '../client/vision/FaceEnrollment.tsx';
import { VisionProvider } from '../client/vision/resources.tsx';
import { createFaceGallery } from '../client/vision/identity.ts';
import type { SensorContext } from '../shared/contracts.ts';
const context:SensorContext={sourceId:'camera',runId:'r',getSyncId:()=> 'sync',nextSeq:()=>1};
let media:ReturnType<typeof vi.fn>;let stop:()=>void;
beforeEach(()=>{
  media=vi.fn();stop=vi.fn();
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:media}});
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_name:string,_options:unknown,callback:(lock:object)=>Promise<void>)=>callback({name:'waiting-room-foreground-camera'})}});
  Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.defineProperty(HTMLVideoElement.prototype,'getVideoPlaybackQuality',{configurable:true,value:function(this:HTMLVideoElement){return {totalVideoFrames:Math.round(this.currentTime*1000)};}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('does not request camera access until Start and exposes unavailable identity honestly',()=>{
  render(<VisionPage context={context} nowMs={()=>0}/>);
  expect(media).not.toHaveBeenCalled();expect(screen.getByRole('heading',{name:'Room vision'})).toBeTruthy();
  expect(screen.getByText(/Face recognition model unavailable/)).toBeTruthy();expect(screen.getByText('No current tracks')).toBeTruthy();
  expect(screen.queryByText('Live camera')).toBeNull();
});
it('shows permission failure and a retry control without invented feeds',async()=>{
  media.mockRejectedValue(new DOMException('no','NotAllowedError'));
  render(<VisionPage context={context} nowMs={()=>0}/>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Start camera'}));});
  expect(screen.getByText(/Camera permission was denied/)).toBeTruthy();expect(screen.getByRole('button',{name:'Start camera'})).toBeTruthy();expect(screen.queryByText('Live camera')).toBeNull();
});
it('stops the one camera and clears the parent stream on unmount',async()=>{
  const track=new EventTarget() as MediaStreamTrack;track.stop=()=>{stop();};
  const stream={getTracks:()=>[track]} as unknown as MediaStream;media.mockResolvedValue(stream);
  const streams:Array<MediaStream|null>=[];
  const view=render(<VisionPage context={context} nowMs={()=>0} onStream={s=>streams.push(s)}/>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Start camera'}));});
  expect(streams).toContain(stream);view.unmount();expect(stop).toHaveBeenCalledTimes(1);expect(streams.at(-1)).toBeNull();
});
it('does not permit enrollment success or camera use without the descriptor adapter',()=>{
  render(<FaceEnrollment visitId='visit-a' nowMs={()=>0}/>);
  expect(screen.getByRole('status').textContent).toContain('Face enrollment unavailable');expect((screen.getByRole('button',{name:'Start face scan'}) as HTMLButtonElement).disabled).toBe(true);expect(media).not.toHaveBeenCalled();
});
it('keeps overlay labels attached to the correct visit and normalized frame geometry',()=>{
  const {container}=render(<TrackOverlay width={640} height={480} bindings={[{trackId:'track-a',visitId:'visit-a',identityEpoch:'e',state:'matched',bounds:{x:.25,y:.2,width:.3,height:.4},sourceSinceAtMs:0,sourceLastVerifiedAtMs:100,observedLocation:null}]}/>);
  const box=container.querySelector('rect')!;expect(box.getAttribute('x')).toBe('160');expect(box.getAttribute('y')).toBe('96');expect(box.getAttribute('width')).toBe('192');expect(screen.getByText(/visit-a/)).toBeTruthy();
});
it('allows the enrollment seam to use a supplied in-memory gallery without reporting fake success',()=>{
  const onEnrolled=vi.fn();render(<VisionProvider resources={{adapter:null,gallery:createFaceGallery(),calibration:null}}><FaceEnrollment visitId='b' nowMs={()=>0} onEnrolled={onEnrolled}/></VisionProvider>);
  expect(onEnrolled).not.toHaveBeenCalled();expect(screen.queryByText('Face scan saved')).toBeNull();
});

it('enrolls exactly the intended visit after three real adapter results and releases the camera',async()=>{
  let now=0,raf:FrameRequestCallback|null=null;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{raf=callback;return 1;});
  vi.stubGlobal('createImageBitmap',async()=>({close:()=>{}}));
  const track=new EventTarget() as MediaStreamTrack;track.stop=()=>{stop();};media.mockResolvedValue({getTracks:()=>[track]});
  const gallery=createFaceGallery(),receipts:Array<{visitId:string;sampleCount:number}>=[];
  const adapter={modelId:'test',similarity:()=>1,detect:async()=>[{bounds:{x:.2,y:.2,width:.2,height:.2},descriptor:[1,0],usable:true,reason:null}]};
  render(<VisionProvider resources={{adapter,gallery,calibration:{modelId:'test',threshold:.8,margin:.1}}}><FaceEnrollment visitId='intended-visit' nowMs={()=>now} onEnrolled={r=>receipts.push(r)}/></VisionProvider>);
  const video=screen.getByLabelText('Face enrollment camera') as HTMLVideoElement;
  Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480},readyState:{value:2}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Start face scan'}));});
  for(now=200;now<=600;now+=200){video.currentTime=now/1000;await act(async()=>{const callback=raf;raf=null;callback?.(now);for(let i=0;i<8;i++)await Promise.resolve();});}
  expect(receipts).toMatchObject([{visitId:'intended-visit',sampleCount:3}]);expect(gallery.list('test').map(e=>e.visitId)).toEqual(['intended-visit']);expect(screen.getByText('Face scan saved for this visit')).toBeTruthy();expect(stop).toHaveBeenCalledTimes(1);
});
it('discards face results that finish after the scan is stopped',async()=>{
  let now=0,raf:FrameRequestCallback|null=null,finish!:(faces:[])=>void;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{raf=callback;return 1;});vi.stubGlobal('createImageBitmap',async()=>({close:()=>{}}));
  const track=new EventTarget() as MediaStreamTrack;track.stop=()=>{stop();};media.mockResolvedValue({getTracks:()=>[track]});
  const gallery=createFaceGallery(),receipts:unknown[]=[];
  render(<VisionProvider resources={{adapter:{modelId:'test',similarity:()=>1,detect:()=>new Promise(r=>{finish=r;})},gallery,calibration:{modelId:'test',threshold:.8,margin:.1}}}><FaceEnrollment visitId='a' nowMs={()=>now} onEnrolled={r=>receipts.push(r)}/></VisionProvider>);
  const video=screen.getByLabelText('Face enrollment camera') as HTMLVideoElement;Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480},readyState:{value:2}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Start face scan'}));});now=200;video.currentTime=.2;
  await act(async()=>{raf?.(200);for(let i=0;i<8;i++)await Promise.resolve();});
  fireEvent.click(screen.getByRole('button',{name:'Stop scan'}));await act(async()=>{finish([]);});
  expect(receipts).toEqual([]);expect(gallery.list('test')).toEqual([]);expect(screen.queryByText('Face scan saved for this visit')).toBeNull();
});
it('does not announce enrollment saved when the authorized session commit fails',async()=>{
  let now=0,raf:FrameRequestCallback|null=null;vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf=cb;return 1;});vi.stubGlobal('createImageBitmap',async()=>({close:()=>{}}));
  const track=new EventTarget() as MediaStreamTrack;track.stop=()=>{stop();};media.mockResolvedValue({getTracks:()=>[track]});const receipt=vi.fn();
  render(<VisionProvider resources={{adapter:{modelId:'test',similarity:()=>1,detect:async()=>[{bounds:{x:.2,y:.2,width:.2,height:.2},descriptor:[1,0],usable:true,reason:null}]},gallery:createFaceGallery(),calibration:{modelId:'test',threshold:.8,margin:.1},saveEnrollment:async()=>{throw Error('Session save failed');}}}><FaceEnrollment visitId='a' nowMs={()=>now} onEnrolled={receipt}/></VisionProvider>);
  const video=screen.getByLabelText('Face enrollment camera') as HTMLVideoElement;Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480},readyState:{value:2}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Start face scan'}));});for(now=200;now<=600;now+=200){video.currentTime=now/1000;await act(async()=>{raf?.(now);for(let i=0;i<8;i++)await Promise.resolve();});}
  expect(receipt).not.toHaveBeenCalled();expect(screen.queryByText('Face scan saved for this visit')).toBeNull();expect(screen.getByRole('status').textContent).toMatch(/failed/i);
});
it('resets a pending save after calibration changes and ignores its late receipt',async()=>{
  let now=0,raf:FrameRequestCallback|null=null,finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf=cb;return 1;});vi.stubGlobal('createImageBitmap',async()=>({close(){}}));
  const track=new EventTarget() as MediaStreamTrack;track.stop=()=>stop();media.mockResolvedValue({getTracks:()=>[track]});
  const receipt=vi.fn(),adapter={modelId:'test',similarity:()=>1,detect:async()=>[{bounds:{x:.2,y:.2,width:.2,height:.2},descriptor:[1,0],usable:true,reason:null}]},gallery=createFaceGallery();
  const draw=(threshold:number)=><VisionProvider resources={{adapter,gallery,calibration:{modelId:'test',threshold,margin:.1},saveEnrollment:async()=>pending}}><FaceEnrollment visitId='a' nowMs={()=>now} onEnrolled={receipt}/></VisionProvider>;
  const view=render(draw(.8));const video=screen.getByLabelText('Face enrollment camera') as HTMLVideoElement;Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480},readyState:{value:2}});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Start face scan'}));});for(now=200;now<=600;now+=200){video.currentTime=now/1000;await act(async()=>{raf?.(now);for(let i=0;i<8;i++)await Promise.resolve();});}
  expect(screen.getByRole('button',{name:'Start face scan'}).hasAttribute('disabled')).toBe(true);view.rerender(draw(.85));expect(screen.getByRole('button',{name:'Start face scan'}).hasAttribute('disabled')).toBe(false);
  await act(async()=>{finish();});expect(receipt).not.toHaveBeenCalled();expect(screen.queryByText('Face scan saved for this visit')).toBeNull();
});
