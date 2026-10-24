import { expect, it, vi } from 'vitest';
import { readVerifiedAsset, descriptorSimilarity, mapFaceResult } from '../client/vision/face-model.ts';
import { createFaceWorkerAdapter } from '../client/vision/worker-adapter.ts';
import { FACE_ASSETS, FACE_MODEL_ID } from '../client/vision/model-assets.ts';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
it('pins every loaded model byte to the exact packaged asset',async()=>{
  for(const asset of FACE_ASSETS){const data=readFileSync(`public${asset.path}`);expect(data.length).toBe(asset.bytes);expect(createHash('sha256').update(data).digest('hex')).toBe(asset.sha256);}
  const bytes=new TextEncoder().encode('asset');const hash=createHash('sha256').update(bytes).digest('hex');
  expect(await readVerifiedAsset({path:'/models/x',sha256:hash,bytes:5},async()=>new Response(bytes))).toEqual(bytes.buffer);
  await expect(readVerifiedAsset({path:'/models/x',sha256:hash,bytes:5},async()=>new Response('wrong'))).rejects.toThrow(/integrity/);
});
it('uses 128D finite Euclidean descriptors without treating a score as probability',()=>{
  const a=Array(128).fill(0),b=[...a];a[0]=1;b[0]=1.4;
  expect(descriptorSimilarity(a,b)).toBeCloseTo(.6);expect(descriptorSimilarity(a,[1])).toBe(-Infinity);expect(descriptorSimilarity(a,Array(128).fill(NaN))).toBe(-Infinity);
});
it('rejects tiny or low-confidence faces and keeps normalized boxes distinct from skin ROIs',()=>{
  const result={score:.9,box:{x:100,y:60,width:160,height:180},descriptor:Array(128).fill(.1),landmarks:Array.from({length:68},(_,i)=>({x:130+i%10,y:90+Math.floor(i/10)}))};
  const good=mapFaceResult(result,640,480,{mean:120,clipped:0,contrast:20});expect(good.bounds).toEqual({x:100/640,y:60/480,width:.25,height:.375});expect(good.usable).toBe(true);
  expect(mapFaceResult({...result,score:.3},640,480,{mean:120,clipped:0,contrast:20}).usable).toBe(false);
  expect(mapFaceResult(result,640,480,{mean:4,clipped:.9,contrast:0}).usable).toBe(false);
});
it('transfers an independent bitmap, rejects concurrent work and closes after errors/disposal',async()=>{
  const worker=new EventTarget() as unknown as Worker;worker.terminate=vi.fn();const sent:any[]=[];worker.postMessage=vi.fn((value:any)=>sent.push(value));
  const cloned={close:vi.fn()} as unknown as ImageBitmap,borrowed={close:vi.fn()} as unknown as ImageBitmap;
  const adapter=createFaceWorkerAdapter(worker,{clone:async()=>cloned,timeoutMs:100});
  const preparing=adapter.ready();worker.dispatchEvent(new MessageEvent('message',{data:{id:sent[0].id,ok:true,modelId:FACE_MODEL_ID}}));await preparing;
  const detecting=adapter.detect(borrowed,{width:640,height:480,sourceAtMs:1});await Promise.resolve();
  await expect(adapter.detect(borrowed,{width:640,height:480,sourceAtMs:2})).rejects.toThrow(/busy/);
  expect(sent[1].image).toBe(cloned);expect(borrowed.close).not.toHaveBeenCalled();
  worker.dispatchEvent(new MessageEvent('message',{data:{id:sent[1].id,ok:true,faces:[]}}));expect(await detecting).toEqual([]);
  adapter.dispose();expect(worker.terminate).toHaveBeenCalled();await expect(adapter.detect(borrowed,{width:1,height:1,sourceAtMs:2})).rejects.toThrow();
});
