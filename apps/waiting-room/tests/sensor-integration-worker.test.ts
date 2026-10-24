import { expect, it } from 'vitest';
import { createSensorWorkerHandler } from '../client/runtime/sensor-worker.ts';
import { createPoseWorkerClient } from '../client/runtime/sensor-worker-client.ts';
import type { SensorWorkerRequest, SensorWorkerResponse } from '../client/runtime/sensor-protocol.ts';
import type { FramePacket } from '../shared/contracts.ts';
function frame(seq:number):FramePacket&{closed:()=>number}{let count=0;return {runId:'run',seq,sourceAtMs:seq*10,monotonicMs:seq*10,width:100,height:100,image:{close:()=>{count++;}} as ImageBitmap,closed:()=>count};}
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
it('initializes local model and returns real landmark metadata while closing owned frame once',async()=>{
 const out:SensorWorkerResponse[]=[];let count=0;
 const handler=createSensorWorkerHandler({load:async()=>({detect:(image,time)=>{count++;return [[{x:0.2,y:0.3,z:0,visibility:1}]];},close:()=>{}}),post:r=>out.push(r)});
 await handler({kind:'sensor-init',id:1});const f=frame(5);await handler({kind:'sensor-pose',id:2,frame:f});
 expect(count).toBe(1);expect(out.at(-1)).toMatchObject({kind:'sensor-pose-result',id:2,runId:'run',frameSeq:5,sourceAtMs:50,landmarks:[[{x:0.2,y:0.3}]]});expect(f.closed()).toBe(1);
});
it('an uninitialized or failed model produces explicit failure and disposes the bitmap',async()=>{
 const out:SensorWorkerResponse[]=[];const handler=createSensorWorkerHandler({load:async()=>{throw Error('private model details');},post:r=>out.push(r)});
 const f=frame(1);await handler({kind:'sensor-pose',id:1,frame:f});expect(f.closed()).toBe(1);expect(out[0]).toMatchObject({kind:'sensor-error'});
 await handler({kind:'sensor-init',id:2});expect(JSON.stringify(out)).not.toContain('private model details');
});
class FakeWorker {
 messages:SensorWorkerRequest[]=[];listeners=new Map<string,Set<(e:any)=>void>>();terminated=false;
 postMessage(message:SensorWorkerRequest){this.messages.push(message);}
 addEventListener(type:string,listener:(e:any)=>void){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type)!.add(listener);}
 removeEventListener(type:string,listener:(e:any)=>void){this.listeners.get(type)?.delete(listener);}
 terminate(){this.terminated=true;}
 reply(value:SensorWorkerResponse){for(const l of this.listeners.get('message')??[])l({data:value});}
}
it('client allows one inference plus newest pending and closes replaced owned frames',async()=>{
 const worker=new FakeWorker(),client=createPoseWorkerClient(worker as unknown as Worker);const init=client.initialize();worker.reply({kind:'sensor-ready',id:1});await init;
 const f1=frame(1),f2=frame(2),f3=frame(3);const a=client.infer(f1),b=client.infer(f2).catch(e=>e),c=client.infer(f3);
 expect(worker.messages.filter(m=>m.kind==='sensor-pose')).toHaveLength(1);expect(f2.closed()).toBe(1);
 worker.reply({kind:'sensor-pose-result',id:2,runId:'run',frameSeq:1,sourceAtMs:10,landmarks:[]});await a;await tick();
 expect(worker.messages.filter(m=>m.kind==='sensor-pose')).toHaveLength(2);
 worker.reply({kind:'sensor-pose-result',id:4,runId:'run',frameSeq:3,sourceAtMs:30,landmarks:[]});await c;expect(await b).toBeInstanceOf(Error);client.dispose();expect(worker.terminated).toBe(true);
});
it('client rejects result stamp mismatch and releases pending work on stop',async()=>{
 const w=new FakeWorker(),c=createPoseWorkerClient(w as unknown as Worker);const init=c.initialize();w.reply({kind:'sensor-ready',id:1});await init;
 const a=c.infer(frame(1)).catch(e=>e),p=frame(2),b=c.infer(p).catch(e=>e);w.reply({kind:'sensor-pose-result',id:2,runId:'wrong',frameSeq:1,sourceAtMs:10,landmarks:[]});
 expect(await a).toBeInstanceOf(Error);c.dispose();expect(await b).toBeInstanceOf(Error);expect(p.closed()).toBe(1);
});
