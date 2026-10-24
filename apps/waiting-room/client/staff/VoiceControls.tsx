import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CheckRequest, RoomSnapshot } from '../../shared/contracts.ts';
import { createAudioQueue, readAudioQueueStatus } from './audio-queue.ts';
import type { AudioQueueStatus } from './audio-queue.ts';
import { createBrowserAudioPlayer, providerClient, voiceContext } from './provider-client.ts';
import type { BrowserAudioPlayer, ProviderClient } from './provider-client.ts';

export type VoiceControlsProps={room:RoomSnapshot|null;connected:boolean;actionEpoch:number};
type Item={eventId:string;version:number;explanation:'pending'|'ready'|'fallback'|'unavailable';voice:string};
export type VoiceStatus={enabled:boolean;muted:boolean;enabling:boolean;testing:boolean;error:string|null;items:Item[];playback:AudioQueueStatus[]};
type Work={context:string;controller:AbortController;item:Item};
type StorageLike=Pick<Storage,'getItem'|'setItem'>;

/** One foreground station controller. No provider calls for a replayed startup backlog. */
export function createVoiceController({client,player,storage,onChange,monotonicNow=()=>performance.now()}:{client:ProviderClient;player:BrowserAudioPlayer;storage:StorageLike;onChange:()=>void;monotonicNow?:()=>number}) {
  let room:RoomSnapshot|null=null,connected=false,visible=true,initialized=false,disposed=false;
  let enabled=false,muted=false,enabling=false,testing=false,error:string|null=null,actionEpoch:number|undefined;
  let serverAnchor=0,monoAnchor=monotonicNow(),lastRoomMono=monoAnchor,localGeneration=0;
  const startup=new Set<string>(),observed=new Set<string>(),speechAllowed=new Set<string>(),blocked=new Set<string>(),started=new Set<string>();
  const work=new Map<string,Work>(),items=new Map<string,Item>(),fetches=new Set<AbortController>();
  let poll:AbortController|null=null,test:AbortController|null=null;
  const key=(event:CheckRequest)=>`${event.id}:${event.snapshotVersion}`;
  const now=()=>serverAnchor+Math.max(0,monotonicNow()-monoAnchor);
  const notify=()=>{if(!disposed)onChange();};
  try{const stored:unknown=JSON.parse(storage.getItem('wr.voice.started.v1')??'[]');if(!Array.isArray(stored)||stored.length>5000||stored.some(v=>typeof v!=='string'))throw Error();for(const id of stored)started.add(id);}
  catch{error='Voice history is unavailable. Audio will remain disabled to prevent repeated announcements.';}
  const storageReady=error===null;
  const queue=createAudioQueue({now,hasStarted:id=>started.has(id),markStarted:id=>{
    if(started.size>=5000)throw Error('Voice history capacity');
    const next=new Set(started);next.add(id);storage.setItem('wr.voice.started.v1',JSON.stringify([...next]));started.add(id);
  },fetchSnapshot:async()=>{
    if(!connected||!visible||disposed)throw Error('Staff connection unavailable');
    const controller=new AbortController();fetches.add(controller);
    try{const value=await client.fetchSnapshot(controller.signal);if(controller.signal.aborted)throw Error('Validation cancelled');acceptRoom(value);return value;}
    finally{fetches.delete(controller);}
  },playAudio:async(job,signal)=>{test?.abort();testing=false;notify();try{await player.play(job,signal);}catch(failure){
    if(!signal.aborted){enabled=false;error='Browser audio failed. Check audio permission and enable voice again.';}
    throw failure;
  }finally{notify();}}});
  function cancel(reason:string):void {
    localGeneration++;queue.invalidateLocal(reason);player.cancel();test?.abort();testing=false;
    for(const event of room?.requests??[])if(event.state==='open')blocked.add(event.id);
    for(const pending of work.values()){pending.controller.abort();pending.item.voice='Cancelled';}
    for(const fetch of fetches)fetch.abort();poll?.abort();notify();
  }
  function acceptRoom(next:RoomSnapshot):void {
    if(room&&next.serverNowMs<room.serverNowMs)return;
    room=next;serverAnchor=next.serverNowMs;monoAnchor=monotonicNow();lastRoomMono=monoAnchor;
    queue.updateSnapshot(next);
    for(const pending of work.values()){
      const event=next.requests.find(e=>e.id===pending.item.eventId&&e.snapshotVersion===pending.item.version);
      if(!event||voiceContext(next,event,now())!==pending.context){pending.controller.abort();pending.item.voice='Cancelled';}
    }
    schedule();notify();
  }
  function schedule():void {
    if(!room||!connected||!visible||disposed)return;
    if(!initialized){for(const event of room.requests)startup.add(event.id);initialized=true;}
    for(const event of room.requests){
      if(event.state!=='open')continue;
      const jobKey=key(event),context=voiceContext(room,event,now());
      if(!observed.has(jobKey)){
        observed.add(jobKey);
        if(enabled&&!muted&&!startup.has(event.id)&&!blocked.has(event.id)&&!started.has(event.id))speechAllowed.add(jobKey);
      }
      if(!context||work.has(jobKey))continue;
      const item:Item={eventId:event.id,version:event.snapshotVersion,explanation:'pending',voice:speechAllowed.has(jobKey)?'Preparing notification':startup.has(event.id)?'Existing request — automatic speech suppressed':'Voice was not enabled for this request'};
      items.set(jobKey,item);if(items.size>100)items.delete(items.keys().next().value!);
      const operation:Work={context,controller:new AbortController(),item};work.set(jobKey,operation);
      const generation=localGeneration;
      void (async()=>{
        try{
          const result=await client.requestExplanation(event.id,event.snapshotVersion,operation.controller.signal);
          if(!current(operation,generation))return;item.explanation=result.state;
          if(!speechAllowed.has(jobKey)||!enabled||muted||blocked.has(event.id)||started.has(event.id)){notify();return;}
          const job=await client.requestSpeech(event.id,event.snapshotVersion,operation.controller.signal);
          if(!current(operation,generation))return;
          if(job.state!=='ready'){item.voice=job.state==='failed'?'Speech provider unavailable':'Notification cancelled';notify();return;}
          // Returned job must also be in the authoritative room readback before queue playback.
          const snapshot=await client.fetchSnapshot(operation.controller.signal);
          if(!current(operation,generation))return;acceptRoom(snapshot);
          if(!current(operation,generation))return;item.voice='Queued';queue.enqueue(job);notify();
        }catch{
          if(operation.controller.signal.aborted||disposed)return;
          item.explanation=item.explanation==='pending'?'unavailable':item.explanation;item.voice='Provider unavailable — check request remains visible';notify();
        }
      })();
    }
  }
  function current(operation:Work,generation:number):boolean {
    if(disposed||!connected||!visible||operation.controller.signal.aborted||generation!==localGeneration||!room)return false;
    const event=room.requests.find(e=>e.id===operation.item.eventId&&e.snapshotVersion===operation.item.version);
    return !!event&&voiceContext(room,event,now())===operation.context;
  }
  const timer=setInterval(()=>{
    if(disposed)return;
    if(connected&&monotonicNow()-lastRoomMono>1500){connected=false;error='Staff connection lost. Voice stopped.';cancel('stale connection');}
    if(connected&&visible&&room&&!poll){
      poll=new AbortController();const request=poll;
      void client.fetchSnapshot(request.signal).then(value=>{if(!disposed&&!request.signal.aborted&&connected)acceptRoom(value);}).catch(()=>{
        if(!disposed&&!request.signal.aborted){connected=false;error='Staff connection unavailable. Voice stopped.';cancel('connection failure');}
      }).finally(()=>{if(poll===request)poll=null;});
    }
    notify();
  },750);
  return {
    update(props:VoiceControlsProps):void {
      if(disposed)return;
      const changed=actionEpoch!==undefined&&props.actionEpoch!==actionEpoch;
      if(changed||!props.connected){if(props.room)room=props.room;cancel(changed?'staff action':'disconnected');}
      actionEpoch=props.actionEpoch;connected=props.connected;
      if(props.room&&connected)acceptRoom(props.room);else if(!props.room)room=null;
      notify();
    },
    async enable():Promise<void>{
      if(disposed||enabling)return;if(!storageReady){notify();return;}
      enabling=true;error=null;notify();
      try{await player.unlock();if(disposed)return;enabled=true;queue.setMuted(muted);await queue.enable();}
      catch{enabled=false;error='Browser audio is unavailable. Allow audio and enable voice again.';}
      finally{enabling=false;notify();}
    },
    setMuted(value:boolean):void {muted=value;queue.setMuted(value);if(value)cancel('muted');notify();},
    setVisible(value:boolean):void {visible=value;if(!value)cancel('hidden tab');else schedule();notify();},
    async testAudio():Promise<void>{
      if(disposed||testing)return;if(readAudioQueueStatus(queue).some(s=>s.state==='playing')){error='A notification is playing. Wait before testing the speaker.';notify();return;}
      testing=true;error=null;test=new AbortController();notify();
      try{await player.test(test.signal);}catch{if(!test.signal.aborted)error='Test audio could not play. Check browser audio permission and the speaker.';}
      finally{testing=false;test=null;notify();}
    },
    status():VoiceStatus{return {enabled,muted,enabling,testing,error,items:[...items.values()].map(item=>({...item})),playback:readAudioQueueStatus(queue)};},
    dispose():void{if(disposed)return;cancel('disposed');disposed=true;clearInterval(timer);queue.dispose();player.dispose();work.clear();items.clear();},
  };
}

/** StaffPage owns the mount and increments actionEpoch before acknowledge/check requests. */
export function VoiceControls(props:VoiceControlsProps) {
  const controller=useRef<ReturnType<typeof createVoiceController>|null>(null);
  const propsRef=useRef(props);propsRef.current=props;
  const [status,setStatus]=useState<VoiceStatus>({enabled:false,muted:false,enabling:false,testing:false,error:null,items:[],playback:[]});
  useEffect(()=>{
    let active=true;let storage:StorageLike;
    try{storage=window.sessionStorage;}catch{storage={getItem:()=>{throw Error();},setItem:()=>{throw Error();}};}
    const next=createVoiceController({client:providerClient,player:createBrowserAudioPlayer(),storage,onChange:()=>{if(active)setStatus(next.status());}});
    controller.current=next;next.setVisible(document.visibilityState!=='hidden');next.update(propsRef.current);setStatus(next.status());
    const visibility=()=>next.setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;document.removeEventListener('visibilitychange',visibility);next.dispose();if(controller.current===next)controller.current=null;};
  },[]);
  useLayoutEffect(()=>{controller.current?.update(props);},[props.room,props.connected,props.actionEpoch]);
  return <section className="wr-voice-controls" aria-labelledby="wr-voice-title" style={{border:'1px solid #d6d6db',borderRadius:16,padding:20,margin:'16px 0',background:'#fff',color:'#1d1d1f'}}>
    <h2 id="wr-voice-title" style={{margin:'0 0 8px',fontSize:20}}>Staff voice notifications</h2>
    <p>One concise announcement for each new check request. Names and questionnaire details are not spoken.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
      <button type="button" style={{minHeight:44}} disabled={status.enabling||status.enabled} onClick={()=>void controller.current?.enable()}>{status.enabling?'Enabling audio…':status.enabled?'Voice enabled':'Enable voice notifications'}</button>
      <button type="button" style={{minHeight:44}} disabled={!status.enabled} aria-pressed={status.muted} onClick={()=>controller.current?.setMuted(!status.muted)}>{status.muted?'Unmute voice':'Mute voice'}</button>
      <button type="button" style={{minHeight:44}} disabled={status.testing} onClick={()=>void controller.current?.testAudio()}>{status.testing?'Playing local test tone…':'Test speaker with local tone'}</button>
    </div>
    <p role="status">{!props.connected?'Disconnected — voice is stopped.':status.muted?'Muted. Missed notifications will not play on unmute.':status.enabled?'Enabled for new requests while this staff tab is visible.':'Voice is off. Existing requests remain on screen.'}</p>
    {status.error&&<p role="alert">{status.error}</p>}
    {status.items.length>0&&<ul aria-label="Notification status">{status.items.map(item=>{const playback=status.playback.find(p=>p.eventId===item.eventId);return <li key={`${item.eventId}:${item.version}`}>Check request · explanation {item.explanation} · {playback?playback.state:item.voice}</li>;})}</ul>}
    <p style={{fontSize:13,color:'#5b5b62'}}>A browser or provider failure does not dismiss a check request. A started announcement is never automatically replayed.</p>
  </section>;
}
