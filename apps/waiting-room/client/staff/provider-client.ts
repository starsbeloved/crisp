import { z } from 'zod';
import type { AlertExplanation, Answers, AudioJob, CheckRequest, QuestionnaireSummary, RoomSnapshot } from '../../shared/contracts.ts';
import { answersSchema, idSchema, roomSnapshotSchema, summarySchema } from '../../shared/schemas.ts';
import { currentRequestBinding } from '../../shared/request-binding.ts';
import { ApiError } from '../runtime/api.ts';

const explanationSchema=z.strictObject({eventId:idSchema,snapshotVersion:z.number().int().positive(),statements:z.array(z.strictObject({evidenceId:idSchema,phraseKey:z.enum(['observed','reported','missing','simulated'])})).max(32),explanation:z.string().max(20000),notificationText:z.string().max(300),evidenceIds:z.array(idSchema).max(32),limitations:z.array(z.string().max(300)).max(8)});
const resultSchema=z.strictObject({state:z.enum(['ready','fallback']),value:explanationSchema});
const jobSchema=z.strictObject({id:idSchema,eventId:idSchema,snapshotVersion:z.number().int().positive(),state:z.enum(['pending','ready','failed','cancelled']),text:z.string().max(300),url:z.string().nullable(),createdAtMs:z.number().finite().nonnegative()});
const errorSchema=z.object({error:z.object({code:z.string(),message:z.string()})});
const proposedSchema=summarySchema.refine(v=>v.confirmed===false);
export type ExplanationResult={state:'ready'|'fallback';value:AlertExplanation};
function aborted(){return new DOMException('Audio operation cancelled','AbortError');}

export function createProviderClient(fetcher:typeof fetch=(...args)=>fetch(...args)) {
  async function request<T>(path:string,schema:z.ZodType<T>,signal:AbortSignal,body?:unknown,timeout=10000):Promise<T> {
    if(signal.aborted)throw new ApiError(0,'ABORTED','Request cancelled');
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    let rejectStop!:(e:ApiError)=>void;
    const stopped=new Promise<never>((_resolve,reject)=>{rejectStop=reject;});
    const stop=(code:'TIMEOUT'|'ABORTED')=>{controller.abort();rejectStop(new ApiError(0,code,code==='TIMEOUT'?'Local service timed out':'Request cancelled'));};
    const abort=()=>stop('ABORTED');signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>stop('TIMEOUT'),timeout);
    try {
      return await Promise.race([stopped,(async()=>{
        const response=await fetcher(`/api/wr${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
        const value:unknown=await response.json();
        if(!response.ok){const parsed=errorSchema.safeParse(value);throw new ApiError(response.status,parsed.success?parsed.data.error.code:'HTTP_ERROR',parsed.success?parsed.data.error.message:'Local provider request failed');}
        const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError(502,'INVALID_RESPONSE','Invalid local provider response');return parsed.data;
      })()]);
    }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(0,'NETWORK_ERROR','Local provider service unavailable');}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  function input<T>(schema:z.ZodType<T>,value:unknown):T{const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError(400,'INVALID_REQUEST','Invalid provider request');return parsed.data;}
  const event=(id:string,version:number)=>{input(idSchema,id);input(z.number().int().positive(),version);return encodeURIComponent(id);};
  return {
    fetchSnapshot:(signal:AbortSignal):Promise<RoomSnapshot>=>request('/room',roomSnapshotSchema,signal,undefined,1000),
    async summarizeQuestionnaire(visitId:string,answers:Answers,signal:AbortSignal):Promise<QuestionnaireSummary>{
      input(idSchema,visitId);input(answersSchema,answers);return request('/questionnaire-summary',proposedSchema,signal,{visitId,answers});
    },
    async requestExplanation(eventId:string,version:number,signal:AbortSignal):Promise<ExplanationResult>{
      const result=await request(`/requests/${event(eventId,version)}/explain`,resultSchema,signal,{snapshotVersion:version});
      if(result.value.eventId!==eventId||result.value.snapshotVersion!==version)throw new ApiError(502,'INVALID_RESPONSE','Explanation version mismatch');return result;
    },
    async requestSpeech(eventId:string,version:number,signal:AbortSignal):Promise<AudioJob>{
      const result=await request(`/requests/${event(eventId,version)}/speech`,jobSchema,signal,{snapshotVersion:version},20000);
      if(result.eventId!==eventId||result.snapshotVersion!==version)throw new ApiError(502,'INVALID_RESPONSE','Audio version mismatch');return result;
    },
  };
}
export type ProviderClient=ReturnType<typeof createProviderClient>;
export const providerClient=createProviderClient();

/** Current context, never immutable trigger identity, determines whether live speech is eligible. */
export function voiceContext(room:RoomSnapshot,event:CheckRequest,now:number):string|null {
  if(room.cameraState!=='live'||event.state!=='open'||now-room.serverNowMs>1500||room.serverNowMs>now+1000)return null;
  const b=currentRequestBinding(room,event);if(!b||room.serverNowMs-b.lastVerifiedAtMs>1500||b.lastVerifiedAtMs>room.serverNowMs+1000)return null;
  const location=b.observedLocation;
  if((location?.label??null)!==event.location||location&&(room.serverNowMs-location.observedAtMs>1500||location.observedAtMs>room.serverNowMs+1000))return null;
  return JSON.stringify([event.id,event.snapshotVersion,event.visitId,b.trackId,b.identityEpoch,event.location,b.state,b.sourceId,b.runId]);
}

export type BrowserAudioPlayer={unlock():Promise<void>;play(job:AudioJob,signal:AbortSignal):Promise<void>;test(signal:AbortSignal):Promise<void>;cancel():void;dispose():void};
/** Generated local tone/silence. Contains no event or patient data. */
function toneBlob(audible:boolean):Blob {
  const rate=16000,count=audible?3200:800,buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);
  const ascii=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  ascii(0,'RIFF');view.setUint32(4,36+count*2,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const envelope=Math.min(1,i/160,(count-i)/160);view.setInt16(44+i*2,audible?Math.round(Math.sin(i*2*Math.PI*660/rate)*3200*envelope):0,true);}
  return new Blob([buffer],{type:'audio/wav'});
}
export function createBrowserAudioPlayer(options:{audio?:HTMLAudioElement;fetch?:typeof fetch;createObjectURL?:(blob:Blob)=>string;revokeObjectURL?:(url:string)=>void}={}):BrowserAudioPlayer {
  const audio=options.audio??new Audio();audio.preload='auto';
  const fetcher=options.fetch??((...args)=>fetch(...args));
  const createUrl=options.createObjectURL??(blob=>URL.createObjectURL(blob)),revoke=options.revokeObjectURL??(url=>URL.revokeObjectURL(url));
  let active:{cancel:()=>void}|null=null,disposed=false;
  function run(signal:AbortSignal,source:(signal:AbortSignal)=>Blob|Promise<Blob>,resolveOnStart=false,timeout=60000):Promise<void> {
    if(disposed||signal.aborted)return Promise.reject(aborted());active?.cancel();
    return new Promise<void>((resolve,reject)=>{
      const controller=new AbortController();let url:string|null=null,settled=false,timer:ReturnType<typeof setTimeout>|undefined;
      const cleanup=()=>{
        clearTimeout(timer);controller.abort();signal.removeEventListener('abort',onAbort);audio.removeEventListener('ended',onEnded);audio.removeEventListener('error',onError);
        audio.pause();audio.removeAttribute('src');audio.load();if(url){revoke(url);url=null;}if(active===operation)active=null;
      };
      const finish=(error?:unknown)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve();};
      const onAbort=()=>finish(aborted()),onEnded=()=>finish(),onError=()=>finish(new Error('Audio playback failed'));
      const operation={cancel:onAbort};active=operation;
      timer=setTimeout(()=>finish(new Error('Audio operation timed out')),timeout);
      signal.addEventListener('abort',onAbort,{once:true});audio.addEventListener('ended',onEnded);audio.addEventListener('error',onError);
      function start(blob:Blob):void {
        if(settled||controller.signal.aborted)return;
        try{url=createUrl(blob);audio.src=url;const playing=audio.play();
          Promise.resolve(playing).then(()=>{if(resolveOnStart)finish();},()=>finish(new Error('Browser did not allow audio playback. Enable audio again.')));
        }catch{finish(new Error('Audio playback unavailable'));}
      }
      try{const blob=source(controller.signal);if(blob instanceof Blob)start(blob);else void blob.then(start,error=>finish(error));}catch(error){finish(error);}
    });
  }
  async function audioBlob(job:AudioJob,signal:AbortSignal):Promise<Blob> {
    if(job.state!=='ready'||!job.url||!/^\/api\/wr\/audio\/[A-Za-z0-9_-]{1,96}$/.test(job.url))throw new Error('Audio unavailable');
    const response=await fetcher(job.url,{credentials:'same-origin',cache:'no-store',redirect:'error',signal});
    if(signal.aborted)throw aborted();
    if(!response.ok||!response.headers.get('content-type')?.startsWith('audio/mpeg')||!response.body)throw new Error('Audio unavailable or no longer eligible');
    const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{while(true){const part=await reader.read();if(signal.aborted)throw aborted();if(part.done)break;size+=part.value.byteLength;if(size>2_000_000)throw new Error('Audio response too large');chunks.push(new Uint8Array(part.value));}
      if(!size)throw new Error('Empty audio response');return new Blob(chunks,{type:'audio/mpeg'});
    }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  return {unlock:()=>run(new AbortController().signal,()=>toneBlob(false),true,3000),play:(job,signal)=>run(signal,child=>audioBlob(job,child)),test:signal=>run(signal,()=>toneBlob(true),false,3000),cancel:()=>active?.cancel(),dispose:()=>{disposed=true;active?.cancel();}};
}
