// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {CheckInPage} from '../client/check-in/CheckInPage.tsx';
import {VisionProvider} from '../client/vision/resources.tsx';
import {createFaceGallery} from '../client/vision/identity.ts';
const visit={id:'enroll-visit',label:'Patient 021',preferredName:null,consentAtMs:100,completedAtMs:null,createdAtMs:100,answers:null,summary:null,assignedSeat:null};
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function backend(){vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
  if(url.endsWith('/kiosk'))return Response.json({ok:true});
  if(url.endsWith('/kiosk/session'))return Response.json({visit:null});
  if(url.endsWith('/kiosk/visit'))return Response.json({...visit,consentAtMs:JSON.parse(String(init.body)).consent?100:null});
  throw Error(`Unexpected ${url}`);
});}
async function begin(consent:boolean){fireEvent.click(screen.getByRole('button',{name:'Start check-in'}));await screen.findByLabelText('Preferred name or demo alias');if(consent){fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Save and continue'}));}else fireEvent.click(screen.getByRole('button',{name:'Continue without camera consent'}));await screen.findByText('Patient 021');}
it('exposes actual consented enrollment and continues only after its authorized save',async()=>{
  backend();let time=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>time);let raf:FrameRequestCallback|null=null,resolveSave!:()=>void;
  const save=new Promise<void>(resolve=>{resolveSave=resolve;});
  const stop=vi.fn(),media=vi.fn(async()=>{const track=new EventTarget() as MediaStreamTrack;track.stop=stop;return {getTracks:()=>[track]};});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:media}});
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_n:string,_o:unknown,fn:(lock:object)=>Promise<void>)=>fn({})}});
  Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.defineProperty(HTMLVideoElement.prototype,'getVideoPlaybackQuality',{configurable:true,value:function(this:HTMLVideoElement){return {totalVideoFrames:Math.round(this.currentTime*1000)};}});
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{raf=fn;return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});vi.stubGlobal('createImageBitmap',async()=>({close(){}}));
  const gallery=createFaceGallery();const adapter={modelId:'test',similarity:()=>1,detect:async()=>[{bounds:{x:.2,y:.2,width:.2,height:.2},descriptor:[1,0],usable:true,reason:null}]};
  render(<VisionProvider resources={{gallery,adapter,calibration:{modelId:'test',threshold:.8,margin:.1},saveEnrollment:async e=>{await save;gallery.enroll(e);}}}><CheckInPage/></VisionProvider>);
  await begin(true);expect(media).not.toHaveBeenCalled();
  const start=screen.getByRole('button',{name:'Start face scan'});expect(start.hasAttribute('disabled')).toBe(false);
  const video=screen.getByLabelText('Face enrollment camera') as HTMLVideoElement;Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480},readyState:{value:2}});
  await act(async()=>{fireEvent.click(start);});
  for(let i=1;i<=3;i++){time+=200;video.currentTime=i*.2;await act(async()=>{raf?.(i*200);for(let j=0;j<10;j++)await Promise.resolve();});}
  expect(screen.queryByRole('button',{name:'Continue with face scan saved'})).toBeNull();expect(stop).toHaveBeenCalledTimes(1);
  await act(async()=>{resolveSave();});
  expect(screen.getByRole('button',{name:'Continue with face scan saved'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue with face scan saved'}));expect(screen.getByRole('heading',{name:'Continue on your phone'})).toBeTruthy();expect(gallery.list('test')[0].visitId).toBe(visit.id);
});
it('never mounts a face scan when camera consent was declined',async()=>{
  backend();render(<VisionProvider resources={{gallery:createFaceGallery(),adapter:{modelId:'test',similarity:()=>1,detect:async()=>[]},calibration:{modelId:'test',threshold:.8,margin:.1}}}><CheckInPage/></VisionProvider>);
  await begin(false);expect(screen.queryByRole('button',{name:'Start face scan'})).toBeNull();expect(screen.getByText(/You did not agree to camera enrollment/)).toBeTruthy();expect(screen.getByRole('button',{name:'Continue with identity unavailable'})).toBeTruthy();
});
