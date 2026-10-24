import { expect, it, vi } from 'vitest';
import { createCameraController } from '../client/vision/camera.ts';
import { overlayBounds } from '../client/vision/coordinates.ts';
import type { CameraEnvironment, CameraStatus } from '../client/vision/camera.ts';
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function harness(permission?:Promise<MediaStream>, failConsumer=false){
  let now=0,raf:FrameRequestCallback|null=null,watch:(()=>void)|null=null;
  const track=new EventTarget() as MediaStreamTrack;track.stop=vi.fn();
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]} as unknown as MediaStream;
  const video={srcObject:null,videoWidth:640,videoHeight:480,readyState:2,currentTime:0,play:async()=>{},pause:()=>{}} as unknown as HTMLVideoElement;
  const images:Array<{close:ReturnType<typeof vi.fn>}>=[];
  const env:CameraEnvironment={getUserMedia:()=>permission??Promise.resolve(stream),snapshot:async()=>{const image={close:vi.fn()};images.push(image);return image as unknown as ImageBitmap;},requestFrame:cb=>{raf=cb;return 1;},cancelFrame:()=>{raf=null;},watch:cb=>{watch=cb;return ()=>{watch=null;};},monotonicMs:()=>now};
  const statuses:CameraStatus[]=[],published:number[]=[],streams:Array<MediaStream|null>=[],resets:string[]=[];
  const camera=createCameraController({video,runId:'r',nowMs:()=>now,environment:env,onStatus:s=>statuses.push(s),onStream:s=>streams.push(s),onReset:r=>resets.push(r),onFrame:f=>{expect(images.at(-1)!.close).not.toHaveBeenCalled();published.push(f.seq);if(failConsumer)throw new Error('consumer failed');}});
  return {camera,video,images,statuses,published,streams,resets,track,stream,env,advance:async(t:number,media=t/1000)=>{now=t;video.currentTime=media;const cb=raf;raf=null;cb?.(t);await tick();},stall:(t:number)=>{now=t;watch?.();}};
}
it('labels live only after a decoded frame, borrows snapshots synchronously and closes them',async()=>{
  const h=harness();await h.camera.start();expect(h.statuses.at(-1)!.state).toBe('starting');
  await h.advance(30);expect(h.statuses.at(-1)!.state).toBe('live');expect(h.published).toEqual([1]);expect(h.images[0].close).toHaveBeenCalledTimes(1);
  await h.advance(60,.03);expect(h.published).toEqual([1]);
  h.camera.stop();expect(h.track.stop).toHaveBeenCalledTimes(1);expect(h.video.srcObject).toBeNull();expect(h.streams.at(-1)).toBeNull();
});
it('marks a frozen feed stale within one second and resets capture continuity',async()=>{
  const h=harness();await h.camera.start();await h.advance(20);h.stall(1021);
  expect(h.statuses.at(-1)!.state).toBe('stale');expect(h.streams.at(-1)).toBeNull();expect(h.resets.length).toBeGreaterThan(0);expect(h.track.stop).toHaveBeenCalled();
});
it('rejects a second owner, releases on dispose and handles track loss',async()=>{
  const first=harness(),second=harness();await first.camera.start();await second.camera.start();
  expect(second.statuses.at(-1)!.state).toBe('unavailable');expect(second.video.srcObject).toBeNull();
  first.camera.dispose();await second.camera.start();second.track.dispatchEvent(new Event('ended'));
  expect(second.statuses.at(-1)!.state).toBe('unavailable');expect(second.streams.at(-1)).toBeNull();second.camera.dispose();
});
it('handles permission denial and releases a stream arriving after stop',async()=>{
  const denied=harness(Promise.reject(new DOMException('denied','NotAllowedError')));await denied.camera.start();expect(denied.statuses.at(-1)!.state).toBe('unavailable');denied.camera.dispose();
  let resolve!:(s:MediaStream)=>void;const late=harness(new Promise(r=>resolve=r));const starting=late.camera.start();late.camera.stop();resolve(late.stream);await starting;
  expect(late.track.stop).toHaveBeenCalled();expect(late.video.srcObject).toBeNull();expect(late.published).toEqual([]);late.camera.dispose();
});
it('closes late snapshots after stop and closes even when a consumer throws',async()=>{
  const h=harness();let finish!:(i:ImageBitmap)=>void;h.env.snapshot=()=>new Promise(r=>finish=r);await h.camera.start();const advancing=h.advance(20);h.camera.stop();const close=vi.fn();finish({close} as unknown as ImageBitmap);await advancing;
  expect(close).toHaveBeenCalledTimes(1);expect(h.published).toEqual([]);h.camera.dispose();
  const second=harness(undefined,true);await second.camera.start();await second.advance(20);expect(second.images[0].close).toHaveBeenCalledTimes(1);expect(second.statuses.at(-1)!.state).toBe('unavailable');second.camera.dispose();
});
it('transforms contained, letterboxed and mirrored normalized rectangles to displayed pixels',()=>{
  const box=overlayBounds({x:.25,y:.25,width:.5,height:.5},{width:640,height:480},{width:1000,height:500},false)!;
  expect(box.x).toBeCloseTo(333.333333);expect(box.y).toBeCloseTo(125);expect(box.width).toBeCloseTo(333.333333);expect(box.height).toBeCloseTo(250);
  expect(overlayBounds({x:0,y:0,width:.2,height:.5},{width:100,height:100},{width:200,height:100},true)).toEqual({x:130,y:0,width:20,height:50});
  expect(overlayBounds({x:0,y:0,width:1,height:1},{width:0,height:100},{width:200,height:100},false)).toBeNull();
});

it('respects the browser-wide camera lease before requesting hardware and releases it',async()=>{
  const denied=harness();denied.env.acquireLease=async()=>null;await denied.camera.start();expect(denied.video.srcObject).toBeNull();expect(denied.statuses.at(-1)!.state).toBe('unavailable');denied.camera.dispose();
  const release=vi.fn(),h=harness();h.env.acquireLease=async()=>()=>{release();};await h.camera.start();h.camera.stop();expect(release).toHaveBeenCalledTimes(1);h.camera.dispose();
});
it('stops foreground capture when the document becomes hidden',async()=>{
  const visibility=new EventTarget() as Document;Object.defineProperty(visibility,'hidden',{value:false,configurable:true});
  const h=harness();h.env.visibility=visibility;await h.camera.start();await h.advance(20);Object.defineProperty(visibility,'hidden',{value:true});visibility.dispatchEvent(new Event('visibilitychange'));
  expect(h.statuses.at(-1)!.state).toBe('stale');expect(h.track.stop).toHaveBeenCalledTimes(1);expect(h.streams.at(-1)).toBeNull();h.camera.dispose();
});
it('does not label advancing media time as decoded video when the decoded-frame counter is frozen',async()=>{
  const h=harness();let decoded=1;h.env.decodedFrameId=()=>decoded;
  await h.camera.start();await h.advance(20);expect(h.published).toHaveLength(1);
  await h.advance(500);expect(h.published).toHaveLength(1);h.stall(1021);expect(h.statuses.at(-1)!.state).toBe('stale');h.camera.dispose();
});
it('resets metadata and reports the correct source dimensions when video resolution changes',async()=>{
  const h=harness();await h.camera.start();await h.advance(20);Object.defineProperty(h.video,'videoWidth',{value:1280});await h.advance(50);
  expect(h.statuses.at(-1)!.width).toBe(1280);expect(h.resets).toContain('Camera resolution changed; fresh observation windows');h.camera.dispose();
});
