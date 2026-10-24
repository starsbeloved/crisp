import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Ref, RefObject } from 'react';
import type { ClockSync, Measurement, PulseEstimate, ScalarSample, SensorContext, TimedRGB } from '../../shared/contracts.ts';
import { api, ApiError } from '../runtime/api.ts';
import { openPhoneCapture } from './capture.ts';
import type { PhoneCaptureHandle } from './capture.ts';
import { contactWaveform, estimateContactPulse } from './ppg.ts';

/** Only pass confirmedPatient after the patient has confirmed the safe session label. */
export type PatientCaptureProps = {confirmedPatient?:{visitId:string;label:string};onStateChange?:(state:PhoneState)=>void};
export type PhonePageProps = {context:SensorContext; synchronize:()=>Promise<ClockSync>; nowMs:()=>number}&PatientCaptureProps;
export type PhoneState = {
  phase:'unpaired'|'pairing'|'paired'|'preparing'|'collecting'|'saving'|'unsaved'|'saved'|'unavailable';
  visitId:string|null; confirmed:boolean; reason:string|null; usableMs:number;
  waveform:ScalarSample[]; estimate:PulseEstimate|null; savedInterval:{start:number;end:number}|null;
};
type InputMeasurement=Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>;
type Transport=Pick<typeof api,'join'|'createCapture'|'completeCapture'|'cancelCapture'>;
type Dependencies={transport?:Transport;acquire?:typeof openPhoneCapture;makeId?:()=>string};
type Attempt={generation:number;visitId:string;captureId:string;sourceId:string;runId:string;syncId:string;
  abort:AbortController;handle:PhoneCaptureHandle|null;samples:TimedRGB[];finishing:boolean;startedAtMs:number};
type Pending={captureId:string;input:{requestId:string;measurement:InputMeasurement}};
const initial=():PhoneState=>({phase:'unpaired',visitId:null,confirmed:false,reason:null,usableMs:0,waveform:[],estimate:null,savedInterval:null});
const message=(error:unknown)=>error instanceof Error?error.message:'Phone capture unavailable';
const terminal=(error:unknown)=>error instanceof ApiError&&(error.status===401||error.status===403||error.status===404||error.status===410||['CAPTURE_EXPIRED','CAPTURE_CANCELLED','CAPTURE_COMPLETED','CAPTURE_INVALID','CLOCK_CAPTURE_EXPIRED','CLOCK_CAPTURE_INTERVAL','CLOCK_SYNC_UNKNOWN','SYNC_NOT_FOUND','RUN_RETIRED'].includes(error.code));

/** Phone-only controller; dependencies replace external boundaries in tests. */
export function createPhoneSession(props:PhonePageProps,dependencies:Dependencies={}) {
  const transport=dependencies.transport??api,acquire=dependencies.acquire??openPhoneCapture;
  const makeId=dependencies.makeId??(()=>crypto.randomUUID());
  let state:PhoneState=props.confirmedPatient?{...initial(),phase:'paired',visitId:props.confirmedPatient.visitId,reason:'Your visit is connected. Camera access still needs your consent.'}:initial();
  let generation=0,attempt:Attempt|null=null,pending:Pending|null=null;
  const listeners=new Set<()=>void>();
  const set=(patch:Partial<PhoneState>)=>{state={...state,...patch};listeners.forEach(listener=>listener());};
  const invalidate=async()=>{
    const old=attempt,unsaved=pending;attempt=null;pending=null;generation++;
    old?.abort.abort();
    if(old?.handle)await old.handle.stop();
    const captureId=old?.captureId??unsaved?.captureId;
    if(captureId)await transport.cancelCapture(captureId,makeId()).catch(()=>{});
  };
  const submit=async(item:Pending,version:number)=>{
    if(pending!==item||generation!==version||state.phase==='saving')return;
    set({phase:'saving',reason:'Saving original capture to this visit…'});
    try{
      const result=await transport.completeCapture(item.captureId,item.input);
      if(generation!==version||pending!==item)return;
      const m=item.input.measurement;
      const fields=['id','sourceId','runId','seq','syncId','streamId','channel','method','captureId','visitId','trackId','identityEpoch','sourceStartAtMs','sourceEndAtMs','quality','value','unit','provenance'] as const;
      if(fields.some(field=>result[field]!==m[field]))throw Error('Saved result does not match the original capture and visit');
      pending=null;
      set({phase:'saved',reason:'Saved to the confirmed visit',savedInterval:{start:result.alignedStartAtMs,end:result.alignedEndAtMs}});
    }catch(error){
      if(generation!==version||pending!==item)return;
      if(terminal(error)){pending=null;set({phase:'unavailable',reason:`Reading was not saved: ${message(error)}. Start a new capture; re-pair if needed.`});}
      else set({phase:'unsaved',reason:`Reading not saved: ${message(error)}. Retry keeps the original visit and timestamps.`});
    }
  };
  const finish=async(current:Attempt)=>{
    if(attempt!==current||current.finishing||current.generation!==generation)return;
    current.finishing=true;
    const estimate=estimateContactPulse(current.samples);
    set({estimate,waveform:contactWaveform(current.samples)});
    await current.handle?.stop();
    if(attempt!==current||generation!==current.generation)return;
    if(estimate.quality!=='usable'||estimate.bpm===null){
      const cleanup=invalidate();set({phase:'unavailable',reason:estimate.reason??'Pulse signal is unavailable'});await cleanup;return;
    }
    const samples=current.samples;
    const measurement:InputMeasurement={schemaVersion:1,id:makeId(),sourceId:current.sourceId,runId:current.runId,
      seq:props.context.nextSeq(),syncId:current.syncId,streamId:'phone',channel:'pulse',method:'phone-camera-contact-ppg',
      trackId:null,visitId:current.visitId,identityEpoch:null,captureId:current.captureId,
      sourceStartAtMs:samples[0].tMs,sourceEndAtMs:samples.at(-1)!.tMs,quality:'usable',value:estimate.bpm,unit:'bpm',
      provenance:'live_phone',reason:null,metrics:{...estimate.metrics,attemptDurationMs:samples.at(-1)!.tMs-current.startedAtMs,methodVersion:1}};
    pending={captureId:current.captureId,input:{requestId:makeId(),measurement}};
    attempt=null;
    await submit(pending,current.generation);
  };
  const stop=async()=>{
    const wasActive=attempt!==null||pending!==null||state.phase==='preparing';
    const cleanup=invalidate();
    if(wasActive)set({phase:state.visitId?'paired':'unpaired',reason:'Capture stopped; no new reading saved',usableMs:0,waveform:[],estimate:null,savedInterval:null});
    await cleanup;
  };
  return {
    getState:()=>state,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
    async join(code:string){
      const cleanup=invalidate(),version=generation;
      set({...initial(),phase:'pairing'});
      await cleanup;if(generation!==version)return;
      if(!/^\d{8}$/.test(code)){set({phase:'unpaired',reason:'Enter the eight-digit pairing code from check-in'});return;}
      try{
        const pair=await transport.join(code);
        if(generation!==version)return;
        if(pair.purpose!=='ppg'&&pair.purpose!=='patient')throw Error('This code is for a questionnaire. Request a phone pulse pairing code.');
        set({phase:'paired',visitId:pair.visitId,reason:'Confirm this visit with staff before opening the camera'});
      }catch(error){if(generation===version)set({phase:'unpaired',reason:message(error)});}
    },
    confirmVisit(confirmed:boolean){if(state.visitId&&!['preparing','collecting','saving'].includes(state.phase))set({confirmed});},
    async start(video:HTMLVideoElement){
      if(!state.visitId||!state.confirmed||['preparing','collecting','saving','pairing'].includes(state.phase))return;
      const visitId=state.visitId;
      const cleanup=invalidate(),version=generation;
      set({phase:'preparing',reason:'Synchronizing capture clock…',usableMs:0,waveform:[],estimate:null,savedInterval:null});
      await cleanup;if(generation!==version)return;
      let created:string|null=null;
      try{
        const sync=await props.synchronize();
        if(generation!==version)return;
        const {sourceId,runId}=props.context;
        if(sync.sourceId!==sourceId||sync.runId!==runId||!props.context.getSyncId()||props.context.getSyncId()!==sync.id)throw Error('A valid synchronized source clock is required');
        const paired=await transport.createCapture({requestId:makeId(),sourceId,runId});created=paired.captureId;
        if(generation!==version){await transport.cancelCapture(paired.captureId,makeId()).catch(()=>{});return;}
        if(paired.visitId!==visitId)throw Error('Capture visit does not match the confirmed visit; pair again');
        const current:Attempt={generation:version,visitId,captureId:paired.captureId,sourceId,runId,syncId:sync.id,
          abort:new AbortController(),handle:null,samples:[],finishing:false,startedAtMs:props.nowMs()};
        attempt=current;
        set({phase:'collecting',reason:'Opening rear camera and checking flashlight…'});
        const handle=await acquire(video,sample=>{
          if(attempt!==current||current.finishing||generation!==version)return;
          if(props.context.sourceId!==current.sourceId||props.context.runId!==current.runId){current.abort.abort();return;}
          const previous=current.samples.at(-1);
          if(previous&&(sample.tMs<=previous.tMs||sample.tMs-previous.tMs>200))current.samples=[];
          current.samples.push(sample);
          const usableMs=sample.tMs-current.samples[0].tMs;
          // Bounded, local raw-derived trace while collecting, never uploaded.
          const recent=current.samples.slice(-300);
          const channel=['g','r','b'].find(c=>recent.every(s=>s.saturationFraction[c as 'g'|'r'|'b']<0.05)) as 'g'|'r'|'b'|undefined;
          const mean=channel?recent.reduce((sum,s)=>sum+s[channel],0)/recent.length:0;
          const waveform=channel?recent.map(s=>({tMs:s.tMs,value:s[channel]-mean})):[];
          set({usableMs,waveform,reason:'Collecting contiguous usable signal — hold gently still'});
          if(usableMs>=30000)void finish(current);
        },{signal:current.abort.signal,sourceNow:props.nowMs,onStatus:progress=>{
          if(attempt!==current||current.finishing||generation!==version)return;
          if(!progress.eligible){current.samples=[];set({usableMs:0,waveform:[],reason:progress.reason});}
        }});
        current.handle=handle;
        if(attempt!==current||generation!==version){await handle.stop();return;}
        void handle.done.then(async reason=>{
          if(attempt!==current||current.finishing||generation!==version)return;
          const cleanup=invalidate();set({phase:'unavailable',reason,usableMs:0,waveform:[],estimate:null});await cleanup;
        });
      }catch(error){
        if(generation!==version)return;
        const hasAttempt=attempt!==null,cleanup=invalidate();
        set({phase:'unavailable',reason:message(error),usableMs:0,waveform:[],estimate:null});
        await cleanup;
        if(created&&!hasAttempt)await transport.cancelCapture(created,makeId()).catch(()=>{});
      }
    },
    stop,
    retry:async()=>{if(pending&&state.phase==='unsaved')await submit(pending,generation);},
    dispose:async()=>{await stop();},
  };
}

type Actions={join:(code:string)=>Promise<void>;confirmVisit:(value:boolean)=>void;start:()=>Promise<void>;stop:()=>Promise<void>;retry:()=>Promise<void>};
export function PhoneView({state,actions,videoRef,confirmedPatient}:{state:PhoneState;actions:Actions;videoRef:Ref<HTMLVideoElement>;confirmedPatient?:PatientCaptureProps['confirmedPatient']}) {
  const [code,setCode]=useState('');
  const active=state.phase==='preparing'||state.phase==='collecting';
  const busy=active||state.phase==='saving'||state.phase==='pairing';
  const trace=state.waveform;
  const amplitude=Math.max(0.000001,...trace.map(p=>Math.abs(p.value)));
  const points=trace.map((p,i)=>`${i/Math.max(1,trace.length-1)*300},${40-p.value/amplitude*32}`).join(' ');
  const Container=confirmedPatient?'section':'main';
  return <Container className="phone-page" style={{maxWidth:560,margin:'0 auto',padding:24}}>
    <h1>Phone pulse check</h1>
    <p>Rear camera + flashlight. Frames stay on this phone; only the derived pulse and quality summary are saved.</p>
    {!confirmedPatient&&<form onSubmit={event=>{event.preventDefault();void actions.join(code);}}>
      <label>Eight-digit pairing code <input aria-label="Eight-digit pairing code" inputMode="numeric" autoComplete="off" pattern="[0-9]{8}" maxLength={8} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} disabled={busy}/></label>
      <button type="submit" disabled={busy}>{state.phase==='unsaved'?'Pair another visit and discard unsaved reading':'Pair phone'}</button>
    </form>}
    {state.visitId&&<section aria-label="Visit confirmation"><h2>{confirmedPatient?'Confirm camera consent':'Confirm visit'}</h2><p>Visit: <strong>{confirmedPatient?.label??state.visitId}</strong></p>
      <label><input type="checkbox" checked={state.confirmed} disabled={busy} onChange={event=>actions.confirmVisit(event.target.checked)}/> {confirmedPatient?'I agree to use my rear camera and flashlight for this pulse measurement':'Staff and I confirm this is the intended visit'}</label></section>}
    <p>With your consent, gently cover the rear lens and flashlight with a fingertip. Check that the light is on. Hold still without pressing hard. Stop immediately if uncomfortable.</p>
    <video ref={videoRef} muted playsInline aria-label="Local rear-camera preview" style={{width:'100%',maxHeight:160,objectFit:'cover'}}/>
    <div role="status" aria-live="polite"><strong>{state.phase==='unsaved'?'Not saved':state.phase==='collecting'?'Collecting':state.phase==='saved'?'Saved':state.phase==='unavailable'?'Unavailable':state.phase==='saving'?'Saving':''}</strong> {state.reason}</div>
    {active&&<><p>Usable signal: {(state.usableMs/1000).toFixed(1)} / 30 seconds. Maximum attempt: 60 seconds.</p><progress aria-label="Contiguous usable capture" max={30000} value={state.usableMs}/></>}
    {!!trace.length&&<figure><svg viewBox="0 0 300 80" role="img" aria-label="Local derived optical waveform"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5"/></svg><figcaption>Local derived optical waveform — signal quality is experimental</figcaption></figure>}
    {state.estimate?.bpm!==null&&state.estimate?.bpm!==undefined&&<p>Contact pulse estimate: {Math.round(state.estimate.bpm)} bpm {state.phase==='unsaved'&&'— not saved'}</p>}
    {state.savedInterval&&<p>Historical reading: {new Date(state.savedInterval.start).toLocaleTimeString()} – {new Date(state.savedInterval.end).toLocaleTimeString()}</p>}
    {state.estimate&&<details><summary>Signal quality details</summary><p>{state.estimate.reason??'Prototype engineering gates passed; accuracy requires device verification.'}</p><dl>{Object.entries(state.estimate.metrics).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{Number(value.toFixed(3))}</dd></div>)}</dl></details>}
    {active?<button type="button" onClick={()=>void actions.stop()}>Stop camera and flashlight now</button>:<button type="button" disabled={!state.confirmed||busy} onClick={()=>void actions.start()}>{state.phase==='unsaved'?'Discard unsaved reading and start a new capture':'Start camera capture'}</button>}
    {state.phase==='unsaved'&&<><button type="button" onClick={()=>void actions.retry()}>Retry saving original reading</button><button type="button" onClick={()=>void actions.stop()}>Discard unsaved reading</button></>}
    <p>Pulse only. This prototype does not provide a diagnosis or medical triage.</p>
  </Container>;
}
export function PhonePage(props:PhonePageProps) {
  const latest=useRef(props);latest.current=props;
  const {sourceId,runId}=props.context;
  const session=useMemo(()=>createPhoneSession({
    context:{sourceId,runId,getSyncId:()=>latest.current.context.getSyncId(),nextSeq:()=>latest.current.context.nextSeq()},
    synchronize:()=>latest.current.synchronize(),nowMs:()=>latest.current.nowMs(),confirmedPatient:props.confirmedPatient,
  }),[sourceId,runId,props.confirmedPatient?.visitId]);
  const state=useSyncExternalStore(session.subscribe,session.getState,session.getState);
  const video=useRef<HTMLVideoElement>(null);
  useEffect(()=>()=>{void session.dispose();},[session]);
  useEffect(()=>{latest.current.onStateChange?.(state);},[state]);
  const actions:Actions={join:session.join,confirmVisit:session.confirmVisit,stop:session.stop,retry:session.retry,start:async()=>{if(video.current)await session.start(video.current);}};
  return <PhoneView state={state} actions={actions} videoRef={video as RefObject<HTMLVideoElement|null>} confirmedPatient={props.confirmedPatient}/>;
}
