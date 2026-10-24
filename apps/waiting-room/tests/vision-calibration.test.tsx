// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FaceCalibration} from '../client/vision/FaceCalibration.tsx';
import {VisionProvider} from '../client/vision/resources.tsx';
import {createFaceGallery} from '../client/vision/identity.ts';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('requires explicit volunteer consent and keeps new capture disabled while calibration saves',async()=>{
  let raf:FrameRequestCallback|null=null,now=0,finish!:()=>void;const saved=new Promise<void>(resolve=>{finish=resolve;});
  vi.spyOn(performance,'now').mockImplementation(()=>now);
  const media=vi.fn(async()=>{const track=new EventTarget() as MediaStreamTrack;track.stop=()=>{};return {getTracks:()=>[track]};});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:media}});Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_n:string,_o:unknown,fn:(l:object)=>Promise<void>)=>fn({})}});
  Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});Object.defineProperty(document,'hidden',{configurable:true,value:false});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.defineProperty(HTMLVideoElement.prototype,'getVideoPlaybackQuality',{configurable:true,value:function(this:HTMLVideoElement){return {totalVideoFrames:Math.round(this.currentTime*1000)};}});
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf=cb;return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});vi.stubGlobal('createImageBitmap',async()=>({close(){}}));
  let captured=0;render(<VisionProvider resources={{gallery:createFaceGallery(),calibration:null,adapter:{modelId:'test',similarity:()=>1,detect:async()=>[{bounds:{x:.2,y:.2,width:.2,height:.2},descriptor:[++captured],usable:true,reason:null}]},session:{mode:'station',status:'ready',error:null,connect:async()=>{},refresh:async()=>{},saveCalibration:async()=>saved}}}><FaceCalibration/></VisionProvider>);
  expect(screen.getByRole('button',{name:'Capture reference person'}).hasAttribute('disabled')).toBe(true);expect(media).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('checkbox'));
  const video=screen.getByLabelText('Calibration camera') as HTMLVideoElement;Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480},readyState:{value:2}});
  for(const label of ['Capture reference person','Capture same person again','Capture different person']){
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:label}));});
    for(let i=0;i<3;i++){now+=250;video.currentTime=now/1000;await act(async()=>{raf?.(now);for(let j=0;j<10;j++)await Promise.resolve();});}
  }
  expect(screen.getByText('Checking captured distributions…')).toBeTruthy();expect(screen.getByRole('button',{name:'Capture different person'}).hasAttribute('disabled')).toBe(true);
  await act(async()=>{finish();});expect(screen.getByText(/Calibration saved from these captures/)).toBeTruthy();
});
