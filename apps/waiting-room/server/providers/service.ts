import { randomUUID } from 'node:crypto';
import type { AlertExplanation, AlertSnapshot, AudioJob, ProviderState, RoomSnapshot } from '../../shared/contracts.ts';
import { ProviderError, withProviderDeadline } from './common.ts';
import { eligibilityStamp } from './eligibility.ts';
import type { ExplanationResult } from './gemini.ts';
import { buildFactualFallback, validateAlertExplanation } from './grounding.ts';
import type { NotificationInput } from './elevenlabs.ts';
import { currentRequestBinding } from '../../shared/request-binding.ts';

type Entry={key:string;stamp:string;snapshot:AlertSnapshot;controller:AbortController;expiresAt:number;timer:ReturnType<typeof setTimeout>;
  explanation:{state:ProviderState;value:AlertExplanation|null};explanationPromise:Promise<ExplanationResult>|null;
  job:AudioJob|null;speechPromise:Promise<AudioJob>|null;bytes:Uint8Array|null};
export type ProviderServiceOptions={stationId:string;getRoomSnapshot:()=>RoomSnapshot;getSnapshot:(eventId:string)=>AlertSnapshot;
  now:()=>number;explain:(snapshot:AlertSnapshot,signal:AbortSignal)=>Promise<ExplanationResult>;
  synthesize:(input:NotificationInput,signal:AbortSignal)=>Promise<Uint8Array>};

/** Private, station-bound cache. Integrator exposes jobs/status in RoomSnapshot; bytes stay here. */
export function createProviderService(options:ProviderServiceOptions) {
  const entries=new Map<string,Entry>();let disposed=false;
  if(!options.stationId)throw new ProviderError('invalid-input');
  function authorize(station:string):void{if(station!==options.stationId)throw new ProviderError('forbidden');if(disposed)throw new ProviderError('unavailable');}
  function key(id:string,version:number){return JSON.stringify([id,version]);}
  function invalidate(entry:Entry):void {
    entry.controller.abort();entry.bytes=null;
    if(entry.job){entry.job.state='cancelled';entry.job.url=null;}
    entry.explanation={state:'unavailable',value:null};
  }
  function eligible(entry:Entry):boolean {
    return !disposed&&!entry.controller.signal.aborted&&options.now()<entry.expiresAt&&eligibilityStamp(options.getRoomSnapshot(),entry.snapshot.eventId,entry.snapshot.version,options.now())===entry.stamp;
  }
  function expire(entry:Entry):void {invalidate(entry);clearTimeout(entry.timer);entries.delete(entry.key);}
  function prune():void {for(const entry of entries.values())if(options.now()>=entry.expiresAt)expire(entry);}
  function obtain(eventId:string,version:number,station:string):Entry {
    authorize(station);prune();
    const stamp=eligibilityStamp(options.getRoomSnapshot(),eventId,version,options.now());if(!stamp)throw new ProviderError('ineligible');
    const id=key(eventId,version);const existing=entries.get(id);
    if(existing){if(!eligible(existing)){invalidate(existing);throw new ProviderError('ineligible');}return existing;}
    if(entries.size>=20)throw new ProviderError('capacity');
    const snapshot=structuredClone(options.getSnapshot(eventId));
    if(snapshot.eventId!==eventId||snapshot.version!==version)throw new ProviderError('ineligible');
    const current=options.getRoomSnapshot().requests.find(e=>e.id===eventId)!;
    if(snapshot.event.visitId!==current.visitId||snapshot.event.trackId!==current.trackId||snapshot.event.identityEpoch!==current.identityEpoch||snapshot.event.location!==current.location||snapshot.event.state!=='open')throw new ProviderError('ineligible');
    const binding=currentRequestBinding(options.getRoomSnapshot(),current);
    const context=(b:AlertSnapshot['binding'])=>b?JSON.stringify([b.visitId,b.trackId,b.identityEpoch,b.state,b.sourceId,b.runId,b.observedLocation?.label??null]):null;
    if(context(binding)!==context(snapshot.binding))throw new ProviderError('ineligible');
    buildFactualFallback(snapshot); // Validate bounded evidence before allocating a job or making a call.
    const entry:Entry={key:id,stamp,snapshot,controller:new AbortController(),expiresAt:options.now()+60000,timer:undefined as unknown as ReturnType<typeof setTimeout>,explanation:{state:'idle',value:null},explanationPromise:null,job:null,speechPromise:null,bytes:null};
    entry.timer=setTimeout(()=>expire(entry),60000);entry.timer.unref?.();entries.set(id,entry);return entry;
  }
  function explainEntry(entry:Entry):Promise<ExplanationResult> {
    if(entry.explanationPromise)return entry.explanationPromise;
    entry.explanation={state:'pending',value:null};
    entry.explanationPromise=(async()=>{
      let result:ExplanationResult;
      try {
        result=await withProviderDeadline(entry.controller.signal,signal=>options.explain(structuredClone(entry.snapshot),signal));
      } catch(error) {
        if(!eligible(entry))throw new ProviderError('ineligible');
        const reason=error instanceof ProviderError&&error.code==='timeout'?'timeout':'unavailable';
        result={state:'fallback',value:buildFactualFallback(entry.snapshot,reason)};
      }
      if(!eligible(entry))throw new ProviderError('ineligible');
      const value=validateAlertExplanation(result.value,entry.snapshot);
      if(result.state!=='ready'&&result.state!=='fallback')throw new ProviderError('invalid-output');
      entry.explanation={state:result.state,value};return {state:result.state,value:structuredClone(value)};
    })().catch(error=>{if(!entry.controller.signal.aborted)entry.explanation={state:'unavailable',value:null};throw error;});
    return entry.explanationPromise;
  }
  return {
    async requestExplanation(eventId:string,version:number,station:string):Promise<ExplanationResult>{
      return structuredClone(await explainEntry(obtain(eventId,version,station)));
    },
    async requestSpeech(eventId:string,version:number,station:string):Promise<AudioJob> {
      const entry=obtain(eventId,version,station);if(entry.speechPromise)return structuredClone(await entry.speechPromise);
      entry.job={id:randomUUID(),eventId,snapshotVersion:version,state:'pending',text:'',url:null,createdAtMs:options.now()};
      entry.speechPromise=(async()=>{
        try {
          const result=await explainEntry(entry);if(!eligible(entry))throw new ProviderError('ineligible');
          const validated=validateAlertExplanation(result.value,entry.snapshot);entry.job!.text=validated.notificationText;
          const bytes=await withProviderDeadline(entry.controller.signal,signal=>options.synthesize({eventId,snapshotVersion:version,text:validated.notificationText},signal));
          if(!eligible(entry))throw new ProviderError('ineligible');
          if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.byteLength>2_000_000)throw new ProviderError('invalid-output');
          entry.bytes=bytes.slice();entry.job!.state='ready';entry.job!.url=`/api/wr/audio/${entry.job!.id}`;
        } catch {
          entry.bytes=null;entry.job!.state=eligible(entry)?'failed':'cancelled';entry.job!.url=null;
        }
        return structuredClone(entry.job!);
      })();
      return structuredClone(await entry.speechPromise);
    },
    getExplanation(eventId:string,version:number,station:string):{state:ProviderState;value:AlertExplanation|null}{
      authorize(station);prune();const entry=entries.get(key(eventId,version));if(!entry)return {state:'idle',value:null};
      if(!eligible(entry))invalidate(entry);return structuredClone(entry.explanation);
    },
    listAudioJobs(station:string):AudioJob[]{authorize(station);prune();return [...entries.values()].flatMap(entry=>{
      if(!eligible(entry))invalidate(entry);return entry.job?[structuredClone(entry.job)]:[];
    });},
    readAudio(jobId:string,station:string):Uint8Array {
      authorize(station);prune();const entry=[...entries.values()].find(e=>e.job?.id===jobId);
      if(!entry)throw new ProviderError('expired');
      if(!eligible(entry)){invalidate(entry);throw new ProviderError('ineligible');}
      if(entry.job?.state!=='ready'||!entry.bytes)throw new ProviderError('unavailable');return entry.bytes.slice();
    },
    updateSnapshot(room:RoomSnapshot):void {
      prune();for(const entry of entries.values())if(eligibilityStamp(room,entry.snapshot.eventId,entry.snapshot.version,options.now())!==entry.stamp)invalidate(entry);
    },
    dispose():void {disposed=true;for(const entry of entries.values()){invalidate(entry);clearTimeout(entry.timer);}entries.clear();},
  };
}
