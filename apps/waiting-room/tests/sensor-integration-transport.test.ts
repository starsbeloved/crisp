import { expect, it } from 'vitest';
import { createSensorTransport } from '../client/runtime/sensor-transport.ts';
import type { BindingBatch, ClockSync, Measurement, PoseObservation } from '../shared/contracts.ts';
const clock:ClockSync={id:'sync',sourceId:'camera',runId:'run',offsetMs:1000,uncertaintyMs:10,expiresAtMs:100000};
function binding(t:number,state:'matched'|'uncertain'='matched'):BindingBatch{return {schemaVersion:1,id:`binding_${t}`,sourceId:'camera',runId:'run',seq:t,syncId:'sync',streamId:'binding',sourceAtMs:t,bindings:[{trackId:'track',visitId:state==='matched'?'visit':null,state,identityEpoch:state==='matched'?'epoch':'uncertain',bounds:{x:0,y:0,width:1,height:1},sourceSinceAtMs:state==='matched'?0:t,sourceLastVerifiedAtMs:t,observedLocation:null}]};}
function measurement(end=100):Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>{return {schemaVersion:1,id:`measurement_${end}`,sourceId:'camera',runId:'run',seq:end,syncId:'sync',streamId:'rppg',channel:'pulse',method:'camera-pos',trackId:'track',visitId:'visit',identityEpoch:'epoch',captureId:null,sourceStartAtMs:30,sourceEndAtMs:end,quality:'usable',value:72,unit:'bpm',provenance:'live_camera',reason:null,metrics:{}};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
it('waits for accepted full-window coverage including both clock uncertainty margins',async()=>{
 const sent:unknown[]=[];let accept!:()=>void;
 const t=createSensorTransport({sourceId:'camera',runId:'run',nowMs:()=>200,mapping:()=>clock,transport:{bindings:async()=>{await new Promise<void>(r=>{accept=r;});return {accepted:1,duplicates:0,rejected:0};},observations:async body=>{sent.push(body);return {accepted:body.measurements.length+body.poses.length,duplicates:0,rejected:0};}}});
 t.bindings(binding(110));await tick();t.measurement(measurement());await tick();expect(sent).toEqual([]);accept();await tick();expect(sent).toEqual([]);
 t.bindings(binding(121));await tick();accept();await tick();expect(sent).toMatchObject([{measurements:[{sourceStartAtMs:30,sourceEndAtMs:100,syncId:'sync'}],poses:[]}]);t.dispose();
});
it('retains semantic uncertainty snapshots in order and drops pending wrong-identity windows',async()=>{
 const batches:BindingBatch[]=[],sent:unknown[]=[];const t=createSensorTransport({sourceId:'camera',runId:'run',nowMs:()=>300,mapping:()=>clock,transport:{bindings:async b=>{batches.push(b);return {accepted:1,duplicates:0,rejected:0};},observations:async b=>{sent.push(b);return {accepted:1,duplicates:0,rejected:0};}}});
 t.bindings(binding(100));t.measurement(measurement(180));t.bindings(binding(200,'uncertain'));t.bindings({...binding(300),bindings:[{...binding(300).bindings[0],identityEpoch:'new',sourceSinceAtMs:300}]});await tick();
 expect(batches.map(b=>b.bindings[0].state)).toEqual(['matched','uncertain','matched']);expect(sent).toEqual([]);t.dispose();
});
it('reports failed transport and never keeps sending after an unacknowledged binding',async()=>{
 const statuses:string[]=[],sent:unknown[]=[];const t=createSensorTransport({sourceId:'camera',runId:'run',nowMs:()=>200,mapping:()=>clock,onStatus:s=>statuses.push(s.state),transport:{bindings:async()=>{throw Error('network');},observations:async b=>{sent.push(b);return {accepted:1,duplicates:0,rejected:0};}}});
 t.bindings(binding(200));t.measurement(measurement());await tick();expect(statuses.at(-1)).toBe('failed');expect(sent).toEqual([]);expect(t.status().reason).toMatch(/network|service/i);t.dispose();
});
it('uses authenticated same-origin JSON and validates server counts',async()=>{
 const calls:{url:string;init:RequestInit|undefined}[]=[];
 const t=createSensorTransport({sourceId:'camera',runId:'run',nowMs:()=>200,mapping:()=>clock,fetch:async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify({accepted:1,duplicates:0,rejected:0}),{status:200,headers:{'Content-Type':'application/json'}});}});
 t.bindings(binding(200));await tick();await t.flush();expect(calls[0].url).toBe('/api/wr/bindings');expect(calls[0].init?.credentials).toBe('same-origin');t.dispose();
});

it('drains a binding queued as the previous drain reports ready',async()=>{
 const sent:number[]=[];let added=false;
 const t=createSensorTransport({sourceId:'camera',runId:'run',nowMs:()=>300,mapping:()=>clock,onStatus:s=>{if(s.state==='ready'&&!added){added=true;t.bindings(binding(300));}},transport:{bindings:async b=>{sent.push(b.sourceAtMs);return {accepted:1,duplicates:0,rejected:0};},observations:async()=>({accepted:1,duplicates:0,rejected:0})}});
 t.bindings(binding(200));await tick();expect(sent).toEqual([200,300]);expect(t.status().pending).toBe(0);t.dispose();
});

it('refreshes nurse authority on old-generation pose rejection without hiding a discarded observation',async()=>{
 const statuses:{state:string;reason:string|null}[]=[];let refreshed=0;
 const t=createSensorTransport({sourceId:'camera',runId:'run',nowMs:()=>300,mapping:()=>clock,onStatus:s=>statuses.push(s),onPoseRejected:async poses=>{expect(poses[0].referenceGeneration).toBe(1);refreshed++;return true;},transport:{bindings:async()=>({accepted:1,duplicates:0,rejected:0}),observations:async()=>({accepted:0,duplicates:0,rejected:1})}});
 t.bindings(binding(300));await t.flush();
 const pose:Omit<PoseObservation,'alignedAtMs'|'receivedAtMs'>={schemaVersion:1,id:'pose',sourceId:'camera',runId:'run',seq:1,syncId:'sync',streamId:'pose',referenceGeneration:1,sourceAtMs:200,trackId:'track',visitId:'visit',identityEpoch:'epoch',quality:'usable',provenance:'live_camera',activity:'stationary',seated:true,qualifyingSlump:false,referenceReady:true,reason:null,features:{}};
 t.pose(pose);await t.flush();expect(refreshed).toBe(1);expect(t.status().state).not.toBe('failed');expect(t.status().discarded).toBe(1);expect(statuses.some(s=>s.reason?.includes('reference'))).toBe(true);t.dispose();
});
