import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertSnapshot, AudioJob, RoomSnapshot } from '../shared/contracts.ts';
import { openRequestRoom } from '../shared/fixtures.ts';
import { createAudioQueue, readAudioQueueStatus } from '../client/staff/audio-queue.ts';
import { createNotificationSynthesizer } from '../server/providers/elevenlabs.ts';
import { buildFactualFallback } from '../server/providers/grounding.ts';
import { createProviderService } from '../server/providers/service.ts';

const signal=()=>new AbortController().signal;
function setup() {
  const room=structuredClone(openRequestRoom); const event=room.requests[0];const now=room.serverNowMs;
  const snapshot:AlertSnapshot={eventId:event.id,version:event.snapshotVersion,event,binding:room.bindings[0],visit:room.visits[0],measurements:room.measurements,facts:event.facts};
  const text=buildFactualFallback(snapshot).notificationText;
  const job:AudioJob={id:'job_1',eventId:event.id,snapshotVersion:1,state:'ready',text,url:'/api/wr/audio/job_1',createdAtMs:now};
  room.audioJobs=[job];return {room,snapshot,job,now};
}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
afterEach(()=>vi.useRealTimers());
describe('ElevenLabs adapter (mocked HTTP only)',()=>{
  it('POSTs configured text/model to configured voice using server headers',async()=>{
    const fetcher=vi.fn(async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg'}}));
    const synth=createNotificationSynthesizer({apiKey:'synthetic-test-key',voiceId:'test_voice',modelId:'test_model',fetch:fetcher});
    const input={eventId:'event',snapshotVersion:1,text:'Please check the patient.'};
    expect(await synth(input,signal())).toEqual(new Uint8Array([1,2,3]));
    expect(fetcher).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/text-to-speech/test_voice?output_format=mp3_44100_128',expect.objectContaining({method:'POST',headers:{'xi-api-key':'synthetic-test-key','Content-Type':'application/json',Accept:'audio/mpeg'},body:JSON.stringify({text:input.text,model_id:'test_model'})}));
  });
  it('rejects >300 characters, invalid ids/config before network',async()=>{
    const fetcher=vi.fn();const synth=createNotificationSynthesizer({apiKey:'test',voiceId:'voice',modelId:'model',fetch:fetcher});
    await expect(synth({eventId:'event',snapshotVersion:1,text:'x'.repeat(301)},signal())).rejects.toMatchObject({code:'invalid-input'});
    expect(fetcher).not.toHaveBeenCalled();
    expect(()=>createNotificationSynthesizer({apiKey:'',voiceId:'voice',modelId:'model',fetch:fetcher})).toThrow();
  });
  it.each(['http','mime','empty','oversize'])('truthfully fails %s response',async failure=>{
    const fetcher=vi.fn(async()=> failure==='http'?new Response('private error',{status:503}):new Response(failure==='empty'?new Uint8Array():failure==='oversize'?new Uint8Array(2_000_001):'not audio',{headers:{'content-type':failure==='mime'?'text/html':'audio/mpeg'}}));
    const synth=createNotificationSynthesizer({apiKey:'test',voiceId:'voice',modelId:'model',fetch:fetcher});
    await expect(synth({eventId:'event',snapshotVersion:1,text:'Please check.'},signal())).rejects.toMatchObject({code:'unavailable'});
  });
  it('aborts a hanging response body at 8s and cleans up',async()=>{
    vi.useFakeTimers();let child:AbortSignal|undefined;
    const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{child=init?.signal as AbortSignal;return new Response(new ReadableStream({start(){}}),{headers:{'content-type':'audio/mpeg'}});});
    const pending=createNotificationSynthesizer({apiKey:'test',voiceId:'voice',modelId:'model',fetch:fetcher})({eventId:'event',snapshotVersion:1,text:'Please check.'},signal());
    const check=expect(pending).rejects.toMatchObject({code:'timeout'});await vi.advanceTimersByTimeAsync(8000);await check;
    expect(child?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
  });
});
describe('provider service transient jobs',()=>{
  function serviceFixture(overrides:{explain?:any;synthesize?:any}={}) {
    const f=setup();let room=f.room;let snapshot=f.snapshot;let now=f.now;
    const explain=overrides.explain??vi.fn(async(s:AlertSnapshot)=>({state:'ready' as const,value:buildFactualFallback(s)}));
    const synthesize=overrides.synthesize??vi.fn(async()=>new Uint8Array([1,2,3]));
    const service=createProviderService({stationId:'station_1',getRoomSnapshot:()=>room,getSnapshot:()=>snapshot,now:()=>now,explain,synthesize});
    return {...f,service,explain,synthesize,setRoom:(r:RoomSnapshot)=>room=r,setSnapshot:(s:AlertSnapshot)=>snapshot=s,setNow:(n:number)=>now=n};
  }
  it('uses a uniquely reidentified current track without rewriting the original trigger track',async()=>{
    const f=serviceFixture();const room=structuredClone(f.room),snapshot=structuredClone(f.snapshot);
    room.bindings[0].trackId='reidentified';room.bindings[0].identityEpoch='new_epoch';
    room.requests[0].snapshotVersion=2;snapshot.event.snapshotVersion=2;snapshot.version=2;
    snapshot.binding=room.bindings[0];f.setRoom(room);f.setSnapshot(snapshot);
    const job=await f.service.requestSpeech(f.job.eventId,2,'station_1');
    expect(job.state).toBe('ready');expect(f.snapshot.event.trackId).not.toBe('reidentified');
    const played:string[]=[];room.audioJobs=[job];
    const queue=createAudioQueue({fetchSnapshot:async()=>room,playAudio:async j=>{played.push(j.id);},now:()=>f.now,hasStarted:()=>false,markStarted:()=>{}});
    queue.updateSnapshot(room);await queue.enable();queue.enqueue(job);await flush();
    expect(played).toEqual([job.id]);queue.dispose();f.service.dispose();
  });
  it('caches explanation and deduplicates speech per eligible event/version',async()=>{
    const f=serviceFixture();const id=f.job.eventId;
    const [a,b]=await Promise.all([f.service.requestSpeech(id,1,'station_1'),f.service.requestSpeech(id,1,'station_1')]);
    expect(a).toEqual(b);expect(a.state).toBe('ready');expect(f.explain).toHaveBeenCalledTimes(1);expect(f.synthesize).toHaveBeenCalledTimes(1);
    expect(f.service.readAudio(a.id,'station_1')).toEqual(new Uint8Array([1,2,3]));
    await f.service.requestSpeech(id,1,'station_1');expect(f.synthesize).toHaveBeenCalledTimes(1);f.service.dispose();
  });
  it.each(['wrong-station','version','acknowledged','checked','camera','identity','location'])('rejects %s before a paid call',async kind=>{
    const f=serviceFixture();const room=structuredClone(f.room);
    if(kind==='acknowledged'||kind==='checked')room.requests[0].state=kind;
    if(kind==='camera')room.cameraState='stale';
    if(kind==='identity')room.bindings[0].identityEpoch='other';
    if(kind==='location')room.bindings[0].observedLocation!.label='C2';
    f.setRoom(room);
    await expect(f.service.requestSpeech(f.job.eventId,kind==='version'?2:1,kind==='wrong-station'?'station_2':'station_1')).rejects.toThrow();
    expect(f.synthesize).not.toHaveBeenCalled();expect(f.explain).not.toHaveBeenCalled();f.service.dispose();
  });
  it('drops delayed explanation/audio after semantic invalidation and aborts transport',async()=>{
    let complete!:(bytes:Uint8Array)=>void;let child:AbortSignal|undefined;
    const synthesize=vi.fn(async(_input:unknown,s:AbortSignal)=>{child=s;return new Promise<Uint8Array>(resolve=>complete=resolve);});
    const f=serviceFixture({synthesize});const pending=f.service.requestSpeech(f.job.eventId,1,'station_1');await flush();
    const moved=structuredClone(f.room);moved.bindings[0].observedLocation!.label='C2';moved.requests[0].snapshotVersion++;
    f.setRoom(moved);f.service.updateSnapshot(moved);expect(child?.aborted).toBe(true);
    complete(new Uint8Array([1]));const job=await pending;expect(job.state).toBe('cancelled');expect(job.url).toBeNull();
    expect(()=>f.service.readAudio(job.id,'station_1')).toThrow();f.service.dispose();
  });
  it('keeps an 8s job valid across 10s benign heartbeat/bounds updates',async()=>{
    let complete!:(value:{state:'ready';value:ReturnType<typeof buildFactualFallback>})=>void;
    const f=serviceFixture({explain:vi.fn(async()=>new Promise(resolve=>complete=resolve))});
    const pending=f.service.requestSpeech(f.job.eventId,1,'station_1');await flush();
    const room=structuredClone(f.room);room.serverNowMs+=10000;room.bindings[0].lastVerifiedAtMs+=10000;room.bindings[0].observedLocation!.observedAtMs+=10000;room.bindings[0].bounds.x+=.01;
    f.setRoom(room);f.setNow(room.serverNowMs);f.service.updateSnapshot(room);complete({state:'ready',value:buildFactualFallback(f.snapshot)});
    expect((await pending).state).toBe('ready');f.service.dispose();
  });
  it('does not let callers mutate cached explanation results',async()=>{
    const f=serviceFixture();const value=await f.service.requestExplanation(f.job.eventId,1,'station_1');value.value.notificationText='Corrupted caller text';
    const fresh=await f.service.requestExplanation(f.job.eventId,1,'station_1');expect(fresh.value.notificationText).not.toBe('Corrupted caller text');
    expect((await f.service.requestSpeech(f.job.eventId,1,'station_1')).state).toBe('ready');f.service.dispose();
  });
  it('rejects an event snapshot bound to a superseded camera run before provider calls',async()=>{
    const f=serviceFixture();const snapshot=structuredClone(f.snapshot);snapshot.binding!.runId='old_run';f.setSnapshot(snapshot);
    await expect(f.service.requestSpeech(f.job.eventId,1,'station_1')).rejects.toMatchObject({code:'ineligible'});expect(f.explain).not.toHaveBeenCalled();f.service.dispose();
  });
  it('rechecks GET eligibility, station, expiry and removes transient bytes',async()=>{
    const f=serviceFixture();const job=await f.service.requestSpeech(f.job.eventId,1,'station_1');
    expect(()=>f.service.readAudio(job.id,'station_2')).toThrow();
    f.setNow(f.now+60001);expect(()=>f.service.readAudio(job.id,'station_1')).toThrow();f.service.dispose();
  });
  it('revalidates explanation text before synthesis and preserves a failed job without retries',async()=>{
    const f=serviceFixture({explain:vi.fn(async()=>({state:'ready',value:{...buildFactualFallback(setup().snapshot),notificationText:'Invented diagnosis'}}))});
    const job=await f.service.requestSpeech(f.job.eventId,1,'station_1');expect(job.state).toBe('failed');expect(f.synthesize).not.toHaveBeenCalled();
    await f.service.requestSpeech(f.job.eventId,1,'station_1');expect(f.explain).toHaveBeenCalledTimes(1);f.service.dispose();
  });
  it('exposes fallback status while retaining readable evidence and failed TTS',async()=>{
    const f=serviceFixture({explain:vi.fn(async(s:AlertSnapshot)=>({state:'fallback',value:buildFactualFallback(s,'unavailable')})),synthesize:vi.fn(async()=>{throw new Error('fail');})});
    expect((await f.service.requestSpeech(f.job.eventId,1,'station_1')).state).toBe('failed');
    expect(f.service.getExplanation(f.job.eventId,1,'station_1').state).toBe('fallback');f.service.dispose();
  });
  it('never starts TTS after a delayed explanation is acknowledged',async()=>{
    let complete!:(value:unknown)=>void;let child:AbortSignal|undefined;
    const f=serviceFixture({explain:vi.fn(async(_s:AlertSnapshot,signal:AbortSignal)=>{child=signal;return new Promise(resolve=>complete=resolve);})});
    const pending=f.service.requestSpeech(f.job.eventId,1,'station_1');await flush();
    const room=structuredClone(f.room);room.requests[0].state='acknowledged';f.setRoom(room);f.service.updateSnapshot(room);
    expect(child?.aborted).toBe(true);complete({state:'ready',value:buildFactualFallback(f.snapshot)});
    expect((await pending).state).toBe('cancelled');expect(f.synthesize).not.toHaveBeenCalled();f.service.dispose();
  });
  it('caps transient jobs at 20 and automatically expires their bytes after 60 seconds',async()=>{
    vi.useFakeTimers();const f=setup();const room=structuredClone(f.room);const snapshots=new Map<string,AlertSnapshot>();
    room.requests=Array.from({length:21},(_,i)=>({...f.snapshot.event,id:`event_${i}`}));
    for(const event of room.requests)snapshots.set(event.id,{...structuredClone(f.snapshot),eventId:event.id,event});
    const synthesize=vi.fn(async()=>new Uint8Array([1]));
    const service=createProviderService({stationId:'station',getRoomSnapshot:()=>room,getSnapshot:id=>snapshots.get(id)!,now:()=>f.now,explain:async s=>({state:'ready',value:buildFactualFallback(s)}),synthesize});
    for(let i=0;i<20;i++)await service.requestSpeech(`event_${i}`,1,'station');
    await expect(service.requestSpeech('event_20',1,'station')).rejects.toMatchObject({code:'capacity'});expect(synthesize).toHaveBeenCalledTimes(20);
    await vi.advanceTimersByTimeAsync(60000);expect(service.listAudioJobs('station')).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);service.dispose();
  });
  it('makes one TTS attempt and marks failed on timeout',async()=>{
    vi.useFakeTimers();let child:AbortSignal|undefined;
    const synthesize=vi.fn(async(_input:unknown,s:AbortSignal)=>{child=s;return new Promise<Uint8Array>(()=>{});});
    const f=serviceFixture({synthesize});const pending=f.service.requestSpeech(f.job.eventId,1,'station_1');await flush();
    await vi.advanceTimersByTimeAsync(8000);expect((await pending).state).toBe('failed');expect(child?.aborted).toBe(true);expect(synthesize).toHaveBeenCalledTimes(1);f.service.dispose();expect(vi.getTimerCount()).toBe(0);
  });
});
describe('browser at-most-once audio queue',()=>{
  function queueFixture(play?: (job:AudioJob,signal:AbortSignal)=>Promise<void>) {
    const f=setup();let room=f.room;let now=f.now;const started=new Set<string>();
    const playAudio=vi.fn(play??(async()=>{}));const fetchSnapshot=vi.fn(async()=>room);
    const queue=createAudioQueue({fetchSnapshot,playAudio,now:()=>now,hasStarted:id=>started.has(id),markStarted:id=>{started.add(id);}});
    return {...f,queue,playAudio,fetchSnapshot,started,setRoom:(r:RoomSnapshot)=>room=r,setNow:(n:number)=>now=n};
  }
  it('requires enable, marks before start, and never duplicates polls/retry',async()=>{
    const f=queueFixture();f.queue.enqueue(f.job);await flush();expect(f.playAudio).not.toHaveBeenCalled();
    await f.queue.enable();await flush();expect(f.playAudio).toHaveBeenCalledTimes(1);expect(f.started.has(f.job.eventId)).toBe(true);
    f.queue.enqueue({...f.job,id:'retried'});f.queue.updateSnapshot(f.room);await flush();expect(f.playAudio).toHaveBeenCalledTimes(1);f.queue.dispose();
  });
  it('drops muted jobs without an unmute burst',async()=>{
    const f=queueFixture();await f.queue.enable();f.queue.setMuted(true);f.queue.enqueue(f.job);f.queue.setMuted(false);f.queue.enqueue(f.job);await flush();expect(f.playAudio).not.toHaveBeenCalled();f.queue.dispose();
  });
  it.each(['acknowledged','checked','version','identity','location','camera','expired','fetch-failure','stale-fetch','url','job-state'])('suppresses %s before playback',async kind=>{
    const f=queueFixture();const room=structuredClone(f.room);const job={...f.job};
    if(kind==='acknowledged'||kind==='checked')room.requests[0].state=kind;
    if(kind==='version')room.requests[0].snapshotVersion++;
    if(kind==='identity')room.bindings[0].identityEpoch='other';
    if(kind==='location')room.bindings[0].observedLocation!.label='C2';
    if(kind==='camera')room.cameraState='off';
    if(kind==='expired')f.setNow(f.now+60001);
    if(kind==='fetch-failure')f.fetchSnapshot.mockRejectedValue(new Error('offline'));
    if(kind==='stale-fetch')room.serverNowMs-=2000;
    if(kind==='url')job.url='https://untrusted.invalid/audio';
    if(kind==='job-state')room.audioJobs[0].state='cancelled';
    f.setRoom(room);await f.queue.enable();f.queue.enqueue(job);await flush();expect(f.playAudio).not.toHaveBeenCalled();f.queue.dispose();
  });
  it.each(['acknowledged','checked','identity','location','camera','mute','local','dispose'])('aborts %s during playback and never replays the started event',async kind=>{
    let active:AbortSignal|undefined;let stops=0;
    const f=queueFixture(async(_job,s)=>{active=s;return new Promise<void>((_resolve,reject)=>s.addEventListener('abort',()=>{stops++;reject(new Error('aborted'));},{once:true}));});
    await f.queue.enable();f.queue.enqueue(f.job);await flush();expect(f.playAudio).toHaveBeenCalledTimes(1);
    const room=structuredClone(f.room);
    if(kind==='acknowledged'||kind==='checked')room.requests[0].state=kind;
    if(kind==='identity')room.bindings[0].identityEpoch='other';
    if(kind==='location')room.bindings[0].observedLocation!.label='C2';
    if(kind==='camera')room.cameraState='stale';
    if(kind==='mute')f.queue.setMuted(true);
    else if(kind==='local')f.queue.invalidateLocal('hidden');
    else if(kind==='dispose')f.queue.dispose();
    else f.queue.updateSnapshot(room);
    expect(active?.aborted).toBe(true);expect(stops).toBe(1);
    await flush();f.queue.enqueue(f.job);await flush();expect(f.playAudio).toHaveBeenCalledTimes(1);f.queue.dispose();
  });
  it('keeps playing through harmless bounds/heartbeat updates',async()=>{
    let child:AbortSignal|undefined;let finish!:()=>void;
    const f=queueFixture(async(_job,s)=>{child=s;return new Promise<void>(resolve=>finish=resolve);});
    await f.queue.enable();f.queue.enqueue(f.job);await flush();const room=structuredClone(f.room);room.bindings[0].lastVerifiedAtMs+=100;room.bindings[0].bounds.x+=.01;
    f.queue.updateSnapshot(room);expect(child?.aborted).toBe(false);finish();await flush();f.queue.dispose();
  });
  it('suppresses jobs restored as started after reload and failed-started events',async()=>{
    const f=queueFixture(async()=>{throw new Error('speaker failed');});await f.queue.enable();f.queue.enqueue(f.job);await flush();
    f.queue.enqueue({...f.job,id:'retry'});await flush();expect(f.playAudio).toHaveBeenCalledTimes(1);
    const g=queueFixture();g.started.add(g.job.eventId);await g.queue.enable();g.queue.enqueue(g.job);await flush();expect(g.playAudio).not.toHaveBeenCalled();f.queue.dispose();g.queue.dispose();
  });
  it('exposes voice lifecycle/failure independently of the open check request',async()=>{
    let finish!:()=>void;const f=queueFixture(async()=>new Promise<void>(resolve=>finish=resolve));
    f.queue.enqueue(f.job);expect(readAudioQueueStatus(f.queue)[0].state).toBe('pending');
    await f.queue.enable();await flush();expect(readAudioQueueStatus(f.queue)[0].state).toBe('playing');
    finish();await flush();expect(readAudioQueueStatus(f.queue)[0].state).toBe('played');expect(f.room.requests[0].state).toBe('open');
    const g=queueFixture(async()=>{throw new Error('private browser details');});await g.queue.enable();g.queue.enqueue(g.job);await flush();
    expect(readAudioQueueStatus(g.queue)[0]).toMatchObject({state:'failed',reason:'playback-failed'});expect(JSON.stringify(readAudioQueueStatus(g.queue))).not.toContain('private');f.queue.dispose();g.queue.dispose();
  });
  it('cancels pending last-second fetch on local invalidation and ignores late response',async()=>{
    const f=queueFixture();await f.queue.enable();let complete!:(r:RoomSnapshot)=>void;f.fetchSnapshot.mockImplementation(()=>new Promise(resolve=>complete=resolve));
    f.queue.enqueue(f.job);await flush();f.queue.invalidateLocal('acknowledge initiated');complete(f.room);await flush();expect(f.playAudio).not.toHaveBeenCalled();f.queue.dispose();
  });
  it('stops playing at audio expiry even without another room poll and clears its timer',async()=>{
    vi.useFakeTimers();let active:AbortSignal|undefined;
    const f=queueFixture(async(_job,s)=>{active=s;return new Promise<void>((_resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('expired')),{once:true}));});
    await f.queue.enable();f.queue.enqueue(f.job);await flush();expect(active?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);expect(active?.aborted).toBe(true);await flush();f.queue.dispose();expect(vi.getTimerCount()).toBe(0);
  });
});
