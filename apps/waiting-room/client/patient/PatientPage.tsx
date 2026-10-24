import { useEffect, useRef, useState } from 'react';
import type { Answers, CheckInReceipt, PatientSessionView } from '../../shared/contracts.ts';
import { api, ApiError } from '../runtime/api.ts';
import { PhoneRoute } from '../phone/PhoneRoute.tsx';
import type { PhoneState } from '../phone/PhonePage.tsx';
import { PatientShell, ErrorNotice } from './PatientShell.tsx';
import { QuestionnaireForm } from './QuestionnaireForm.tsx';

type Step='join'|'confirm'|'questions'|'saved'|'pulse'|'review'|'complete'|'ended';
const ended=(e:unknown)=>e instanceof ApiError&&([401,403,410].includes(e.status)||e.code==='VISIT_COMPLETED');
function initialCode(){if(typeof window==='undefined')return '';const fragment=new URLSearchParams(window.location.hash.slice(1));const code=fragment.get('code')??'';return /^\d{8}$/.test(code)?code:'';}
// Only a closed-screen flag is retained in this tab. Never persist answers, grants or visit identifiers.
function wasClosed(){try{return sessionStorage.getItem('wr.patient.closed')==='1';}catch{return false;}}
function markClosed(value:boolean){try{if(value)sessionStorage.setItem('wr.patient.closed','1');else sessionStorage.removeItem('wr.patient.closed');}catch{/* Server authorization remains authoritative when storage is unavailable. */}}

/** A patient cookie can only read this visit. No room/staff API is used here. */
export function PatientPage() {
  const [step,setStep]=useState<Step>(()=>wasClosed()&&!initialCode()?'ended':'join'),[code,setCode]=useState(initialCode);
  const [session,setSession]=useState<PatientSessionView|null>(null),[error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[pulse,setPulse]=useState<PhoneState['phase']>('paired'),[pulseSaved,setPulseSaved]=useState(false);
  const [receipt,setReceipt]=useState<CheckInReceipt|null>(null),[restoreFailed,setRestoreFailed]=useState(false);
  const version=useRef(0),locked=useRef(false),finishId=useRef<string|null>(null);
  const renderVersion=version.current;
  const draft=useRef<Answers|null>(null);
  const expire=()=>{version.current++;markClosed(true);draft.current=null;setSession(null);setCode('');setStep('ended');setError(null);};
  useEffect(()=>{
    let active=true;const epoch=version.current;
    const closed=wasClosed()&&!initialCode();
    if(window.location.hash)window.history.replaceState(null,'',window.location.pathname+window.location.search);
    if(!closed)void api.patientSession().then(value=>{
      if(!active||epoch!==version.current)return;
      if(value.expiresAtMs<=Date.now()||value.visit.completedAtMs!==null){expire();return;}
      setSession(value);setPulseSaved(!!value.contactMeasurement);setStep('confirm');
    }).catch(e=>{if(active&&epoch===version.current&&!ended(e))setRestoreFailed(true);});
    return()=>{active=false;version.current++;};
  },[]);
  useEffect(()=>{
    if(!session||step==='complete'||step==='ended')return;
    const check=()=>{if(Date.now()>=session.expiresAtMs&&!finishId.current)expire();};
    check();const timer=window.setInterval(check,1000);window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);return()=>{window.clearInterval(timer);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',check);};
  },[session?.expiresAtMs,step]);
  useEffect(()=>{
    if(!session)return;
    let disposed=false,inFlight=false;const epoch=version.current;
    const verify=async()=>{
      if(inFlight||finishId.current)return;inFlight=true;
      try{const value=await api.patientSession();if(disposed||epoch!==version.current)return;
        if(value.visit.id!==session.visit.id||value.visit.completedAtMs!==null||value.expiresAtMs<=Date.now()){expire();return;}
        setSession(previous=>previous?{...previous,canEditQuestionnaire:value.canEditQuestionnaire,contactMeasurement:value.contactMeasurement}:previous);
        if(value.contactMeasurement)setPulseSaved(true);
      }catch(e){if(!disposed&&epoch===version.current&&ended(e))expire();}
      finally{inFlight=false;}
    };
    const timer=window.setInterval(()=>void verify(),10000);
    const visible=()=>{if(document.visibilityState==='visible')void verify();};
    document.addEventListener('visibilitychange',visible);
    return()=>{disposed=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[session?.visit.id]);
  const join=async()=>{
    if(locked.current)return;
    if(!/^\d{8}$/.test(code)){setError('Enter the eight-digit check-in code shown on the laptop.');return;}
    locked.current=true;setBusy(true);setError(null);setRestoreFailed(false);const epoch=++version.current;
    try {
      const pair=await api.join(code);
      if(pair.purpose!=='patient')throw Error('This code is not for a complete patient check-in. Ask the operator for a new patient code.');
      const value=await api.patientSession();
      if(epoch!==version.current)return;
      if(value.visit.id!==pair.visitId)throw Error('This session does not match the connected visit. Ask the operator for help.');
      if(value.expiresAtMs<=Date.now()||value.visit.completedAtMs!==null){expire();return;}
      markClosed(false);setSession(value);setPulseSaved(!!value.contactMeasurement);setCode('');setStep('confirm');
    }catch(e){if(epoch===version.current)setError(e instanceof Error?e.message:'Could not connect. Ask for a new code.');}
    finally{locked.current=false;setBusy(false);}
  };
  const finish=async()=>{
    if(!session||locked.current)return;
    locked.current=true;setBusy(true);setError(null);const epoch=version.current;
    finishId.current??=crypto.randomUUID();
    try {
      const result=await api.finishPatient(finishId.current);
      if(epoch!==version.current)return;
      if(result.visitId!==session.visit.id)throw Error('Completion did not match this visit. Please ask the operator for help.');
      markClosed(true);setReceipt(result);draft.current=null;setSession(null);setStep('complete');setCode('');
    }catch(e){if(epoch===version.current){if(ended(e)){finishId.current=null;expire();}else {if(e instanceof ApiError&&e.status>=400&&e.status<500)finishId.current=null;setError(`${e instanceof Error?e.message:'Could not finish.'} Completion is not confirmed. Retry to check the same request.`);}}}
    finally{locked.current=false;setBusy(false);}
  };
  const title=step==='join'?'Connect your visit':step==='confirm'?'Your check-in':step==='questions'?'Your answers':step==='pulse'?'Your pulse':step==='complete'?'Check-in complete':step==='ended'?'Session ended':'Review your check-in';
  const activePulse=['preparing','collecting','saving'].includes(pulse);
  const contact=session?.contactMeasurement;
  const contactStatus=contact?`Saved to this visit · ${contact.value??'unavailable'} ${contact.unit} · ${contact.quality} · ${contact.provenance} · ${new Date(contact.alignedStartAtMs).toLocaleTimeString()}–${new Date(contact.alignedEndAtMs).toLocaleTimeString()} (historical phone reading)`:pulseSaved?'Saved from this phone':'Unavailable or not confirmed on this phone';
  return <PatientShell step={title}>
    {error&&<ErrorNotice message={error}/>}
    {step==='join'&&<><h1>Continue your check-in</h1><p>Use the code from the check-in laptop. We’ll ask you to confirm your visit before showing your answers.</p>
      <form noValidate onSubmit={e=>{e.preventDefault();void join();}}><label htmlFor="patient-code">Check-in code</label><input id="patient-code" inputMode="numeric" autoComplete="off" maxLength={8} value={code} disabled={busy} aria-describedby="patient-code-help" onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/><p id="patient-code-help" className="wr-patient-hint">Eight digits. A code can only be used once.</p><div className="wr-patient-actions"><button disabled={busy}>{busy?'Connecting…':'Connect to my visit'}</button></div></form>
      {restoreFailed&&<p className="wr-patient-note">We could not restore a previous session. Check your connection, then reload before reusing an already-used code.</p>}</>}
    {session&&step==='confirm'&&<><h1>Is this your check-in?</h1><p className="wr-patient-visit">{session.visit.label}</p><p>Match this label with the laptop or ask the operator. Continue only if this is your visit.</p><div className="wr-patient-actions"><button onClick={()=>setStep(session.visit.answers?'saved':'questions')}>Yes, this is my check-in</button><button className="wr-patient-secondary" onClick={expire}>This is not my check-in</button></div><p className="wr-patient-hint">The camera has not started.</p></>}
    {session&&step==='questions'&&<><p className="wr-patient-visit">{session.visit.label}</p>
      {!session.canEditQuestionnaire&&<p className="wr-patient-note">Questions are being edited at the laptop. Ask the operator to save them there, then continue with pulse.</p>}
      {session.canEditQuestionnaire?<QuestionnaireForm key={session.visit.id} visit={session.visit} draft={draft.current} onDraft={value=>{draft.current=value;}} save={input=>api.saveQuestionnaire(session.visit.id,input)} onBusy={setBusy} onSaved={visit=>{if(version.current!==renderVersion)return;draft.current=null;setSession(previous=>previous?{...previous,visit}:previous);setStep('saved');}} onAuthorityError={e=>{if(version.current!==renderVersion)return;if(ended(e))expire();else if(e instanceof ApiError&&e.code==='EDITOR_CONFLICT')setSession(previous=>previous?{...previous,canEditQuestionnaire:false}:previous);}} onBack={()=>setStep('confirm')}/>:<div className="wr-patient-actions"><button onClick={()=>setStep('pulse')}>Continue to pulse</button></div>}
    </>}
    {session&&step==='saved'&&<><h1>Your answers are saved.</h1><p className="wr-patient-visit">{session.visit.label}</p><p>Your original answers are attached to this visit. An AI summary is not required to continue.</p>
      {session.visit.summary?.confirmed&&<section aria-labelledby="patient-confirmed-summary"><h2 id="patient-confirmed-summary">Your confirmed summary</h2><dl><dt>Reported reason</dt><dd>{session.visit.summary.complaint}</dd><dt>Reported onset</dt><dd>{session.visit.summary.onset}</dd><dt>Reported course</dt><dd>{session.visit.summary.course}</dd></dl><p>You reviewed this summary. Your original words are also saved.</p></section>}
      <div className="wr-patient-actions"><button onClick={()=>setStep('pulse')}>Continue with original answers</button>{session.canEditQuestionnaire&&<button className="wr-patient-secondary" onClick={()=>setStep('questions')}>Review or edit answers</button>}</div></>}
    {session&&step==='pulse'&&<>
      <PhoneRoute confirmedPatient={{visitId:session.visit.id,label:session.visit.label}} onStateChange={state=>{setPulse(state.phase);if(state.phase==='saved')setPulseSaved(true);}}/>
      <div className="wr-patient-actions">{pulse==='saved'?<button onClick={()=>setStep('review')}>Review check-in</button>:<button className="wr-patient-secondary" disabled={activePulse||pulse==='unsaved'} onClick={()=>setStep('review')}>Continue with pulse unavailable</button>}<button className="wr-patient-secondary" disabled={activePulse||pulse==='unsaved'} onClick={()=>setStep(session.visit.answers?'saved':'questions')}>Back to answers</button></div>
      {pulse==='unsaved'&&<p className="wr-patient-note">Retry saving the original reading above, or discard it to continue incomplete. The reading is not yet saved.</p>}
    </>}
    {session&&step==='review'&&<><h1>Ready to finish?</h1><p className="wr-patient-visit">{session.visit.label}</p><dl className="wr-patient-status"><dt>Answers</dt><dd>{session.visit.answers?'Saved':'Not confirmed saved on this phone'}</dd><dt>Face enrollment</dt><dd>Confirm enrollment on the check-in laptop. This phone cannot verify its in-memory face session.</dd><dt>Contact pulse</dt><dd>{contactStatus}</dd></dl><p>You can finish with incomplete measurements. This does not assess your health.</p><div className="wr-patient-actions"><button disabled={busy} onClick={()=>void finish()}>{busy?'Finishing…':finishId.current?'Retry finish check-in':'Finish check-in'}</button><button className="wr-patient-secondary" disabled={busy||finishId.current!==null} onClick={()=>setStep('pulse')}>Back to pulse</button></div></>}
    {step==='complete'&&receipt&&<><h1>You’re checked in.</h1><p className="wr-patient-visit">{receipt.label}</p><p>Please take a seat. This check-in has ended and your answers are no longer editable here.</p><p>Confirm face enrollment with the check-in operator. {pulseSaved?'Your pulse reading was saved.':'Contact pulse was unavailable or not confirmed on this phone.'}</p><p className="wr-patient-hint">Completion confirmed at {new Date(receipt.completedAtMs).toLocaleTimeString()}.</p></>}
    {step==='ended'&&<><h1>This check-in has ended.</h1><p>Your session expired or was closed on this screen. Ask the operator to confirm your visit and issue a new connection if needed.</p><p>No camera is running from this screen.</p><button className="wr-patient-secondary" onClick={()=>{markClosed(false);setError(null);setStep('join');}}>Connect a new check-in code</button></>}
  </PatientShell>;
}
