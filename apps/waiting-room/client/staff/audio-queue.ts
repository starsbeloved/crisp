import type { AudioJob, ID, RoomSnapshot } from '../../shared/contracts.ts';
import { currentRequestBinding } from '../../shared/request-binding.ts';

export type AudioQueueOptions={fetchSnapshot:()=>Promise<RoomSnapshot>;playAudio:(job:AudioJob,signal:AbortSignal)=>Promise<void>;
  now:()=>number;hasStarted:(eventId:ID)=>boolean;markStarted:(eventId:ID)=>void};
export type AudioQueue={enable():Promise<void>;setMuted(value:boolean):void;enqueue(job:AudioJob):void;updateSnapshot(snapshot:RoomSnapshot):void;invalidateLocal(reason:string):void;dispose():void};
export type AudioQueueStatus={eventId:ID;jobId:ID;state:'pending'|'validating'|'playing'|'played'|'failed'|'cancelled'|'suppressed';reason:null|'ineligible'|'interrupted'|'snapshot-unavailable'|'persistence-failed'|'playback-failed'};
const statusReaders=new WeakMap<AudioQueue,()=>AudioQueueStatus[]>();
/** Optional dashboard readback; the frozen queue method signatures stay unchanged. */
export function readAudioQueueStatus(queue:AudioQueue):AudioQueueStatus[]{return statusReaders.get(queue)?.()??[];}
type Pending={job:AudioJob;stamp:string|null};
function untilAbort<T>(promise:Promise<T>,signal:AbortSignal):Promise<T> {
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(new Error('Audio interrupted'));
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    if(signal.aborted){signal.removeEventListener('abort',abort);abort();}
  });
}
// Pure client eligibility; no server provider/configuration imports in the browser graph.
function stamp(room:RoomSnapshot,job:AudioJob,now:number):string|null {
  if(room.cameraState!=='live'||!Number.isFinite(now)||room.serverNowMs>now+1000||now-room.serverNowMs>1500||job.createdAtMs>now+1000||now-job.createdAtMs>=60000||job.state!=='ready'||!job.url||!/^\/api\/wr\/audio\/[A-Za-z0-9_-]{1,96}$/.test(job.url))return null;
  const listed=room.audioJobs.find(j=>j.id===job.id);
  if(!listed||listed.state!=='ready'||listed.eventId!==job.eventId||listed.snapshotVersion!==job.snapshotVersion||listed.text!==job.text||listed.url!==job.url)return null;
  const event=room.requests.find(e=>e.id===job.eventId);
  if(!event||event.state!=='open'||event.snapshotVersion!==job.snapshotVersion)return null;
  const b=currentRequestBinding(room,event);
  if(!b||room.serverNowMs-b.lastVerifiedAtMs>1500||b.lastVerifiedAtMs>room.serverNowMs+1000)return null;
  if(event.visitId?b.state!=='matched':b.state==='matched')return null;
  const location=b.observedLocation;
  if((location?.label??null)!==event.location||location&&(room.serverNowMs-location.observedAtMs>1500||location.observedAtMs>room.serverNowMs+1000))return null;
  return JSON.stringify([event.id,event.snapshotVersion,event.visitId,b.trackId,b.identityEpoch,event.location,b.state,b.sourceId,b.runId]);
}

/** At most one start per event. playAudio MUST release its audio/URL synchronously on abort. */
export function createAudioQueue(opts:AudioQueueOptions):AudioQueue {
  let enabled=false,muted=false,disposed=false,generation=0,running=false;
  let latest:RoomSnapshot|null=null,active:{item:Pending;controller:AbortController}|null=null;
  const pending=new Map<ID,Pending>();const suppressed=new Map<ID,number>();
  const statuses=new Map<ID,AudioQueueStatus>();
  function track(job:AudioJob,state:AudioQueueStatus['state'],reason:AudioQueueStatus['reason']=null):void {
    statuses.set(job.eventId,{eventId:job.eventId,jobId:job.id,state,reason});
    if(statuses.size>100)statuses.delete(statuses.keys().next().value!);
  }
  const isSuppressed=(eventId:ID)=>{
    const expiry=suppressed.get(eventId);if(expiry!==undefined&&expiry<=opts.now())suppressed.delete(eventId);
    return suppressed.has(eventId)||opts.hasStarted(eventId);
  };
  const suppress=(job:AudioJob)=>{suppressed.set(job.eventId,Math.max(opts.now()+60000,job.createdAtMs+60000));};
  function invalidate():void {
    generation++;for(const item of pending.values()){suppress(item.job);track(item.job,'cancelled','interrupted');}pending.clear();
    if(active){suppress(active.item.job);track(active.item.job,'cancelled','interrupted');active.controller.abort();}
  }
  async function pump():Promise<void> {
    if(running||!enabled||muted||disposed)return;running=true;
    try {
      while(pending.size&&enabled&&!muted&&!disposed){
        const item=pending.values().next().value!;pending.delete(item.job.eventId);
        if(isSuppressed(item.job.eventId))continue;
        const token=generation;
        const controller=new AbortController();active={item,controller};
        const expiryTimer=setTimeout(()=>controller.abort(),Math.max(0,item.job.createdAtMs+60000-opts.now()));
        let stage:'snapshot'|'persistence'|'playback'='snapshot';track(item.job,'validating');
        try {
          const room=await untilAbort(opts.fetchSnapshot(),controller.signal);
          if(token!==generation||disposed||muted||controller.signal.aborted)continue;
          const next=stamp(room,item.job,opts.now());
          if(!next||(item.stamp!==null&&item.stamp!==next)){track(item.job,'cancelled','ineligible');continue;}
          // updateSnapshot can observe newer remote state while fetchSnapshot is pending.
          if(latest&&(!stamp(latest,item.job,opts.now())||stamp(latest,item.job,opts.now())!==next)){track(item.job,'cancelled','ineligible');continue;}
          item.stamp=next;latest=room;
          if(isSuppressed(item.job.eventId))continue;
          stage='persistence';opts.markStarted(item.job.eventId); // Failure here prevents playback; retry cannot bypass persistence.
          stage='playback';track(item.job,'playing');
          await untilAbort(opts.playAudio({...item.job},controller.signal),controller.signal);
          track(item.job,'played');
        } catch {
          // Started events remain in sessionStorage. No automatic retry after failed/interrupted playback.
          if(controller.signal.aborted)track(item.job,'cancelled','interrupted');
          else track(item.job,'failed',stage==='playback'?'playback-failed':stage==='persistence'?'persistence-failed':'snapshot-unavailable');
        } finally {
          clearTimeout(expiryTimer);suppress(item.job);if(active?.item===item)active=null;
        }
      }
    } finally {running=false;}
  }
  const queue:AudioQueue={
    async enable():Promise<void>{if(disposed)return;enabled=true;void pump();},
    setMuted(value:boolean):void{if(disposed)return;muted=value;if(value)invalidate();else void pump();},
    enqueue(job:AudioJob):void {
      if(disposed||job.state!=='ready'||isSuppressed(job.eventId))return;
      if(muted){suppress(job);track(job,'suppressed');return;}
      if(active?.item.job.eventId===job.eventId||pending.has(job.eventId))return;
      if(pending.size>=20){suppress(job);return;}
      track(job,'pending');pending.set(job.eventId,{job:{...job},stamp:latest?stamp(latest,job,opts.now()):null});void pump();
    },
    updateSnapshot(snapshot:RoomSnapshot):void {
      if(disposed)return;latest=snapshot;
      for(const [id,item]of pending){const next=stamp(snapshot,item.job,opts.now());if(!next||(item.stamp!==null&&item.stamp!==next)){suppress(item.job);track(item.job,'cancelled','ineligible');pending.delete(id);}else item.stamp=next;}
      if(active){const next=stamp(snapshot,active.item.job,opts.now());if(!next||(active.item.stamp!==null&&active.item.stamp!==next)){generation++;suppress(active.item.job);track(active.item.job,'cancelled','ineligible');active.controller.abort();}}
      void pump();
    },
    invalidateLocal(_reason:string):void {if(!disposed){latest=null;invalidate();}},
    dispose():void {if(disposed)return;disposed=true;enabled=false;latest=null;invalidate();suppressed.clear();},
  };
  statusReaders.set(queue,()=>[...statuses.values()].map(status=>({...status})));return queue;
}
