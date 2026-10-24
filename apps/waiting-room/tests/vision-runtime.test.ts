import { expect, it, vi } from 'vitest';
import type { BoundFrame, FramePacket, SensorContext } from '../shared/contracts.ts';
import type { FaceAdapter } from '../client/vision/types.ts';
import { createVisionRuntime } from '../client/vision/runtime.ts';
import { createFaceGallery } from '../client/vision/identity.ts';
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const context:SensorContext={sourceId:'camera',runId:'r',getSyncId:()=> 'sync',nextSeq:(()=>{let n=0;return()=>++n;})()};
const frame=(seq:number,t:number):FramePacket=>({runId:'r',seq,sourceAtMs:t,monotonicMs:t,width:640,height:480,image:{close:vi.fn()} as unknown as ImageBitmap});
function setup(adapter:FaceAdapter|null,calibrated=true){
  let now=0;const gallery=createFaceGallery();gallery.enroll({visitId:'a',modelId:'test',samples:[[1,0],[1,0],[1,0]],capturedAtMs:0});
  const frames:BoundFrame[]=[],batches:Array<{bindings:unknown[];sourceAtMs:number}>=[],clones:Array<{close:ReturnType<typeof vi.fn>}>=[];
  const runtime=createVisionRuntime({context,nowMs:()=>now,resources:{adapter,gallery,calibration:calibrated?{modelId:'test',threshold:.8,margin:.1}:null},clone:async()=>{const image={close:vi.fn()};clones.push(image);return image as unknown as ImageBitmap;},onBindings:b=>batches.push(b),onFrame:f=>frames.push(f)});
  return {runtime,frames,batches,clones,push:async(seq:number,t:number)=>{now=t;runtime.push(frame(seq,t));await tick();},setNow:(t:number)=>{now=t;}};
}
const good:FaceAdapter={modelId:'test',similarity:(a,b)=>a[0]===b[0]?1:0,detect:async()=>[{bounds:{x:.2,y:.2,width:.3,height:.3},descriptor:[1,0],usable:true,reason:null,faceSkin:[{x:.25,y:.25,width:.05,height:.05}]}]};
it('publishes unavailable frames without a descriptor adapter and never invents a binding',async()=>{
  const h=setup(null);await h.push(1,0);expect(h.frames[0]).toMatchObject({binding:null,associationUsable:false,invalidReason:'Face recognition model unavailable'});expect(h.clones).toEqual([]);h.runtime.dispose();
});
it('separates inference snapshots from sampling and preserves actual inference timestamps',async()=>{
  const h=setup(good);await h.push(1,0);await h.push(2,200);await h.push(3,400);await h.push(4,430);
  expect(h.frames.at(-1)).toMatchObject({binding:{visitId:'a'},identityStamp:{frameSeq:3,sourceAtMs:400},associationUsable:true,selectedPersonCount:1});
  expect(h.clones).toHaveLength(3);expect(h.clones.every(i=>i.close.mock.calls.length===1)).toBe(true);h.runtime.dispose();
});
it('expires metadata and invalidates every association across explicit resets',async()=>{
  const h=setup(good);await h.push(1,0);await h.push(2,200);await h.push(3,400);await h.push(4,1000);
  expect(h.frames.at(-1)!.binding).toBeNull();expect(h.frames.at(-1)!.associationUsable).toBe(false);
  h.runtime.reset('camera hidden');expect(h.batches.at(-1)!.bindings).toEqual([]);await h.push(5,1010);expect(h.frames.at(-1)!.binding).toBeNull();h.runtime.dispose();
});
it('drops late inference and closes every owned clone on reset/disposal',async()=>{
  let finish!:(value:Awaited<ReturnType<FaceAdapter['detect']>>)=>void;
  const h=setup({...good,detect:()=>new Promise(r=>finish=r)});await h.push(1,0);h.runtime.reset('source restarted');finish(await good.detect(frame(1,0).image,{width:640,height:480,sourceAtMs:0}));await tick();
  expect(h.batches.every(b=>b.bindings.length===0)).toBe(true);expect(h.clones[0].close).toHaveBeenCalledTimes(1);h.runtime.dispose();
});
it('rejects slow results and model failure instead of reviving previous identity',async()=>{
  let finish!:(value:Awaited<ReturnType<FaceAdapter['detect']>>)=>void;
  const h=setup({...good,detect:()=>new Promise(r=>finish=r)});await h.push(1,0);h.setNow(501);finish(await good.detect(frame(1,0).image,{width:640,height:480,sourceAtMs:0}));await tick();
  expect(h.batches.filter(b=>b.bindings.length)).toEqual([]);h.runtime.dispose();
  const failure=setup({...good,detect:async()=>{throw new Error('failed');}});await failure.push(1,0);await failure.push(2,20);expect(failure.frames.at(-1)!.associationUsable).toBe(false);expect(failure.clones.every(c=>c.close.mock.calls.length===1)).toBe(true);failure.runtime.dispose();
});
it('does not revive a closed inference window when an older packet arrives after expiry',async()=>{
  const h=setup(good);await h.push(1,0);await h.push(2,200);await h.push(3,400);h.setNow(1000);h.runtime.expire();
  const before=h.frames.length;h.runtime.push(frame(2,200));expect(h.frames).toHaveLength(before);h.runtime.dispose();
});
it('reports face motion from distinct same-epoch detections and clears it across a reset',async()=>{
  let x=.2;
  const h=setup({...good,detect:async()=>[{bounds:{x,y:.2,width:.3,height:.3},descriptor:[1,0],usable:true,reason:null}]});
  await h.push(1,0);await h.push(2,200);await h.push(3,400);x=.4;await h.push(4,600);await h.push(5,620);
  expect(h.frames.at(-1)!.faceMotionWidthsPerSecond).toBeCloseTo(3.33333);
  h.runtime.reset('lost');await h.push(6,800);expect(h.frames.at(-1)!.faceMotionWidthsPerSecond).toBeNull();h.runtime.dispose();
});
