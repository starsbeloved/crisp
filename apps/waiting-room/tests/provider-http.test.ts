import { afterEach, expect, it } from 'vitest';
import { createWaitingRoomServer } from '../server/http.ts';
import { listen } from './helpers.ts';
import { buildFactualFallback } from '../server/providers/grounding.ts';
const closes:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of closes.splice(0))await close();});
it('authenticates provider endpoints and leaves providers explicitly unavailable by default',async()=>{
  const app=createWaitingRoomServer({databasePath:':memory:'});closes.push(app.close);
  const origin=await listen(app.server);
  const call=(path:string,body:unknown,cookie?:string)=>fetch(`${origin}/api/wr${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  expect((await call('/requests/event/explain',{snapshotVersion:1})).status).toBe(401);
  const start=await call('/station',{}),cookie=start.headers.get('set-cookie')!.split(';')[0];
  const disabled=await call('/requests/event/explain',{snapshotVersion:1},cookie);
  expect(disabled.status).toBe(503);
  expect((await disabled.json()).error.code).toBe('PROVIDER_UNAVAILABLE');
  expect((await call('/requests/event/speech',{snapshotVersion:1,text:'Arbitrary message'},cookie)).status).toBe(400);
});
it('creates the request before provider work, exposes grounded audio, and revokes it after acknowledgement',async()=>{
  let now=100000,calls=0;
  const app=createWaitingRoomServer({databasePath:':memory:',now:()=>now,providers:{
    explain:async snapshot=>{calls++;return {state:'fallback',value:buildFactualFallback(snapshot)};},
    synthesize:async()=>new Uint8Array([1,2,3]),
  }});closes.push(app.close);
  const origin=await listen(app.server);
  let cookie='';
  const call=(path:string,body?:unknown)=>fetch(`${origin}/api/wr${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});
  cookie=(await call('/station',{})).headers.get('set-cookie')!.split(';')[0];
  const visit=await (await call('/visits',{requestId:'visit'})).json();
  const handshake=await (await call('/clock-sync',{phase:'start',sourceId:'camera',runId:'run',clientSendMs:now})).json();
  const sync=await (await call('/clock-sync',{phase:'complete',handshakeId:handshake.handshakeId,clientReceiveMs:now})).json();
  for(let i=0;i<=21;i++){
    now=100000+i*1000;
    expect((await call('/bindings',{schemaVersion:1,id:`b_${i}`,sourceId:'camera',runId:'run',streamId:'binding',seq:i,syncId:sync.id,sourceAtMs:now,bindings:[{trackId:'track',visitId:visit.id,identityEpoch:'epoch',state:'matched',sourceSinceAtMs:100000,sourceLastVerifiedAtMs:now,bounds:{x:.1,y:.1,width:.4,height:.6},observedLocation:{label:'B4',sourceObservedAtMs:now}}]})).status).toBe(200);
    const result=await (await call('/observations',{measurements:[],poses:[{schemaVersion:1,id:`p_${i}`,sourceId:'camera',runId:'run',streamId:'pose',seq:i,syncId:sync.id,referenceGeneration:1,sourceAtMs:now,trackId:'track',visitId:visit.id,identityEpoch:'epoch',quality:'usable',provenance:'live_camera',activity:'stationary',seated:true,qualifyingSlump:i>=11,referenceReady:true,reason:null,features:{}}]})).json();
    expect(result.accepted).toBe(1);
  }
  const room=await (await call('/room')).json();expect(room.requests).toHaveLength(1);expect(calls).toBe(0);
  const event=room.requests[0];
  const speech=await call(`/requests/${event.id}/speech`,{snapshotVersion:event.snapshotVersion});expect(speech.status).toBe(200);
  const job=await speech.json();expect(job.state).toBe('ready');
  const readback=await (await call('/room')).json();expect(readback.explanations[event.id].state).toBe('fallback');expect(readback.audioJobs).toHaveLength(1);
  const audio=await call(`/audio/${job.id}`);expect(audio.headers.get('content-type')).toBe('audio/mpeg');expect(audio.headers.get('cache-control')).toBe('private, no-store');expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([1,2,3]));
  await call(`/requests/${event.id}/acknowledge`,{requestId:'ack'});
  expect((await call(`/audio/${job.id}`)).status).toBe(409);
  expect(calls).toBe(1);
});

it('summarizes only for a current questionnaire editor and rechecks after a delayed provider result',async()=>{
  let resolve!:(value:any)=>void;let requested=0;
  const proposal={complaint:'Reported: Original words',onset:'Today, reported',course:'Staying the same, reported',confirmed:false};
  const app=createWaitingRoomServer({databasePath:':memory:',summarize:async()=>{requested++;return new Promise(r=>{resolve=r;});}});closes.push(app.close);
  const origin=await listen(app.server);
  const call=(path:string,body:unknown,cookie?:string)=>fetch(`${origin}/api/wr${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const answers={reason:'Original words',onset:'today',onsetNote:'',course:'same'};
  expect((await call('/questionnaire-summary',{answers})).status).toBe(401);expect(requested).toBe(0);
  const staff=(await call('/station',{})).headers.get('set-cookie')!.split(';')[0];
  const visit=await (await call('/visits',{requestId:'summary_visit'},staff)).json();
  const grant=await (await call(`/visits/${visit.id}/pair`,{requestId:'pair_summary',purpose:'patient'},staff)).json();
  const phone=(await call('/join',{code:grant.code})).headers.get('set-cookie')!.split(';')[0];
  const pending=call('/questionnaire-summary',{visitId:visit.id,answers},phone);
  while(!requested)await new Promise(r=>setTimeout(r,1));
  await call(`/visits/${visit.id}/takeover`,{requestId:'takeover_summary'},staff);
  resolve(proposal);expect((await pending).status).toBe(409);
  expect((await call('/questionnaire-summary',{visitId:visit.id,answers},phone)).status).toBe(409);
});
it('returns an unconfirmed summary, preserves originals and rejects arbitrary scope or completed kiosk access',async()=>{
  const proposal={complaint:'Reported: Original words',onset:'Today, reported',course:'Staying the same, reported',confirmed:false};
  const app=createWaitingRoomServer({databasePath:':memory:',summarize:async()=>proposal});closes.push(app.close);const origin=await listen(app.server);
  const call=(path:string,body:unknown,cookie?:string)=>fetch(`${origin}/api/wr${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const kiosk=(await call('/kiosk',{})).headers.get('set-cookie')!.split(';')[0];
  const answers={reason:'Original words',onset:'today',onsetNote:'',course:'same'};
  expect((await call('/questionnaire-summary',{answers},kiosk)).status).toBe(409);
  const visit=await (await call('/kiosk/visit',{requestId:'summary_kiosk'},kiosk)).json();
  expect(await (await call('/questionnaire-summary',{visitId:visit.id,answers},kiosk)).json()).toEqual(proposal);
  expect((await call('/questionnaire-summary',{answers,visitId:'foreign'},kiosk)).status).toBe(403);
  await call('/kiosk/questionnaire',{requestId:'save_original',answers},kiosk);
  await call('/kiosk/finish',{requestId:'finish'},kiosk);
  expect((await call('/questionnaire-summary',{visitId:visit.id,answers},kiosk)).status).toBe(409);
});
