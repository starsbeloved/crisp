import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Answers, CheckInReceipt, Visit } from '../../shared/contracts.ts';
import { api, ApiError } from '../runtime/api.ts';
import { PatientShell, ErrorNotice } from '../patient/PatientShell.tsx';
import { QuestionnaireForm } from '../patient/QuestionnaireForm.tsx';
import { patientPhoneLink } from './phone-link.ts';
import { FaceEnrollment } from '../vision/FaceEnrollment.tsx';
import { IdentitySetup } from '../vision/IdentitySetup.tsx';
import { useVisionResources } from '../vision/resources.tsx';
import type { EnrollmentReceipt } from '../vision/types.ts';

type Step='welcome'|'resume'|'about'|'face'|'handoff'|'questions'|'saved'|'complete'|'reset-failed';
type Grant={code:string;expiresAtMs:number;image:string};
/** Camera access requires consent and an explicit Start face scan action. */
export function CheckInPage({phoneOrigin=import.meta.env.VITE_PATIENT_ORIGIN}:{phoneOrigin?:string}={}) {
  const vision=useVisionResources();
  const [faceReceipt,setFaceReceipt]=useState<EnrollmentReceipt|null>(null),[faceBusy,setFaceBusy]=useState(false);
  const [step,setStep]=useState<Step>('welcome'),[visit,setVisit]=useState<Visit|null>(null);
  const [name,setName]=useState(''),[consent,setConsent]=useState(false),[error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[grant,setGrant]=useState<Grant|null>(null),[receipt,setReceipt]=useState<CheckInReceipt|null>(null);
  const [warning,setWarning]=useState(false),[now,setNow]=useState(Date.now),[replacing,setReplacing]=useState(false);
  const [takeoverRequired,setTakeoverRequired]=useState(false);
  const draft=useRef<Answers|null>(null);
  const active=useRef(true),locked=useRef(false),epoch=useRef(0),lastActivity=useRef(Date.now());
  const createInput=useRef<{requestId:string;preferredName?:string;consent:boolean}|null>(null);
  const resetId=useRef<string|null>(null),finishId=useRef<string|null>(null),pairId=useRef<string|null>(null);
  const activity=()=>{if(!warning)lastActivity.current=Date.now();};
  const clearLocal=()=>{draft.current=null;setFaceReceipt(null);setFaceBusy(false);setTakeoverRequired(false);setVisit(null);setName('');setConsent(false);setGrant(null);setReceipt(null);setWarning(false);setReplacing(false);createInput.current=null;finishId.current=null;pairId.current=null;lastActivity.current=Date.now();};
  useEffect(()=>{active.current=true;return()=>{active.current=false;epoch.current++;};},[]);
  const begin=async()=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError(null);const version=++epoch.current;
    try {await api.startKiosk();const current=await api.kioskSession();if(!active.current||version!==epoch.current)return;
      clearLocal();if(current.receipt){setReceipt(current.receipt);setStep('complete');}else if(current.visit){setVisit(current.visit);if(current.visit.completedAtMs!==null){setReceipt({visitId:current.visit.id,label:current.visit.label,completedAtMs:current.visit.completedAtMs});setStep('complete');}else {setTakeoverRequired(true);setStep('resume');}}else setStep('about');
    }catch(e){if(active.current&&version===epoch.current)setError(e instanceof Error?e.message:'Could not start check-in. Try again.');}
    finally{locked.current=false;if(active.current)setBusy(false);}
  };
  const reset=async()=>{
    if(locked.current)return;locked.current=true;setBusy(true);const version=++epoch.current;
    // Clear displayed personal data immediately; do not permit another visit until revocation succeeds.
    clearLocal();setError(null);resetId.current??=crypto.randomUUID();setStep('reset-failed');
    try {await api.kioskReset(resetId.current);if(!active.current||version!==epoch.current)return;resetId.current=null;setStep('welcome');}
    catch(e){if(active.current&&version===epoch.current)setError(`${e instanceof Error?e.message:'Could not end this session.'} Please retry ending the session before the next person starts.`);}
    finally{locked.current=false;if(active.current)setBusy(false);}
  };
  useEffect(()=>{
    const timer=window.setInterval(()=>{
      const time=Date.now();setNow(time);
      // The handoff shows no answers and intentional phone work must not be interrupted by kiosk inactivity.
      if(busy||faceBusy||['welcome','handoff','complete','reset-failed'].includes(step)){lastActivity.current=time;return;}
      const elapsed=time-lastActivity.current;
      if(elapsed>=150000){void reset();return;}
      if(elapsed>=120000)setWarning(true);
    },1000);return()=>window.clearInterval(timer);
  },[busy,faceBusy,step]);
  useEffect(()=>{
    if(step!=='handoff'||!visit)return;
    let stopped=false,inFlight=false;const version=epoch.current;
    const read=async()=>{if(inFlight)return;inFlight=true;
      try {const result=await api.kioskSession();if(stopped||version!==epoch.current)return;
        if(result.receipt?.visitId===visit.id){draft.current=null;setVisit(null);setReceipt(result.receipt);setGrant(null);setError(null);setStep('complete');return;}
        if(!result.visit||result.visit.id!==visit.id)throw Error('This station session changed. Ask the operator before continuing.');
        setVisit(result.visit);
        if(result.visit.completedAtMs!==null){setReceipt({visitId:result.visit.id,label:result.visit.label,completedAtMs:result.visit.completedAtMs});setGrant(null);setStep('complete');}
      }catch(e){if(!stopped&&version===epoch.current){setError(e instanceof Error?e.message:'Could not refresh phone progress.');if(e instanceof ApiError&&[401,403,410].includes(e.status)){clearLocal();setStep('reset-failed');}}}
      finally{inFlight=false;}
    };
    const timer=window.setInterval(()=>void read(),3000);return()=>{stopped=true;window.clearInterval(timer);};
  },[step,visit?.id]);
  const create=async(agreed:boolean)=>{
    if(locked.current)return;
    if(!agreed&&consent){setConsent(false);}
    locked.current=true;setBusy(true);setError(null);const version=epoch.current;
    createInput.current??={requestId:crypto.randomUUID(),...(name.trim()?{preferredName:name.trim()}:{}),consent:agreed};
    try{const value=await api.kioskCreateVisit(createInput.current);if(active.current&&version===epoch.current){setVisit(value);setStep('face');createInput.current=null;}}
    catch(e){if(active.current&&version===epoch.current)setError(`${e instanceof Error?e.message:'Could not save your visit.'} Retry saves the same check-in.`);}
    finally{locked.current=false;if(active.current)setBusy(false);}
  };
  const pair=async()=>{
    if(locked.current||!visit)return;
    if(!patientPhoneLink(phoneOrigin,'12345678')){setError('A phone-accessible trusted HTTPS address must be configured before a phone code can be created. Ask the operator or answer here.');return;}
    locked.current=true;setBusy(true);setError(null);const version=epoch.current;pairId.current??=crypto.randomUUID();
    try{const value=await api.kioskPair(pairId.current);const url=patientPhoneLink(phoneOrigin,value.code);if(!url)throw Error('Phone address is unavailable.');const svg=await QRCode.toString(url,{type:'svg',width:256,margin:3,errorCorrectionLevel:'M'});const image=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;if(active.current&&version===epoch.current){setGrant({...value,image});setTakeoverRequired(true);pairId.current=null;setReplacing(false);}}
    catch(e){if(active.current&&version===epoch.current)setError(e instanceof Error?e.message:'Could not create a phone code. Retry.');}
    finally{locked.current=false;if(active.current)setBusy(false);}
  };
  const questions=async()=>{
    if(locked.current||!visit)return;
    // A phone may own the editor after pairing or resume. Never overwrite that lease silently.
    if(takeoverRequired){
      locked.current=true;setBusy(true);setError(null);const version=epoch.current;
      try{await api.kioskTakeover(crypto.randomUUID());const current=await api.kioskSession();if(!active.current||version!==epoch.current)return;if(current.visit?.id!==visit.id)throw Error('This station visit changed. Ask for assistance.');draft.current=null;setVisit(current.visit);setTakeoverRequired(false);setStep('questions');}
      catch(e){if(active.current&&version===epoch.current)setError(e instanceof Error?e.message:'Could not take over the questions.');}
      finally{locked.current=false;if(active.current)setBusy(false);}
    }else setStep('questions');
  };
  const finish=async()=>{
    if(locked.current||!visit)return;locked.current=true;setBusy(true);setError(null);const version=epoch.current;finishId.current??=crypto.randomUUID();
    try{const value=await api.kioskFinish(finishId.current);if(!active.current||version!==epoch.current)return;if(value.visitId!==visit.id)throw Error('Completion does not match this visit. Ask for assistance.');setReceipt(value);setGrant(null);setVisit(null);setStep('complete');}
    catch(e){if(active.current&&version===epoch.current){if(e instanceof ApiError&&e.status>=400&&e.status<500)finishId.current=null;setError(`${e instanceof Error?e.message:'Could not finish.'} Completion is not confirmed.`);}}
    finally{locked.current=false;if(active.current)setBusy(false);}
  };
  const enrolled=!!visit&&visit.consentAtMs!==null&&!!vision.calibration&&vision.calibration.modelId===vision.adapter?.modelId&&vision.gallery.list(vision.calibration.modelId).some(e=>e.visitId===visit.id);
  const completedFaceSaved=!!receipt&&faceReceipt?.visitId===receipt.visitId;
  const qrReady=patientPhoneLink(phoneOrigin,'12345678')!==null;
  const expired=!!grant&&grant.expiresAtMs<=now;
  return <PatientShell step={step==='welcome'?'Welcome':step==='about'?'About you':step==='face'?'Face enrollment':step==='complete'?'Check-in complete':'Your check-in'} onActivity={activity}>
    {error&&<ErrorNotice message={error}/>}
    {warning&&<section className="wr-patient-note" role="alert"><h2>Do you need more time?</h2><p>This screen will close after 30 seconds to protect your information. Saved records are kept.</p><button onClick={()=>{lastActivity.current=Date.now();setWarning(false);}}>I need more time</button></section>}
    {step==='welcome'&&<><h1>Welcome.<br/>Let’s get you checked in.</h1><p>We’ll connect a few details, your answers and an optional phone pulse reading to one visit.</p><p>Camera enrollment and monitoring are part of this prototype. You can ask for assistance or continue with incomplete measurements.</p><div className="wr-patient-actions"><button disabled={busy} onClick={()=>void begin()}>{busy?'Starting…':'Start check-in'}</button></div><p className="wr-patient-hint">One laptop is used for check-in, then room monitoring. Monitoring is paused during check-in.</p></>}
    {step==='resume'&&<><h1>An unfinished check-in is here</h1><p className="wr-patient-visit">{visit?.label}</p><p>Continue only if this is your visit. Otherwise end this session before starting a new one. Ask the operator if you are unsure.</p><div className="wr-patient-actions"><button disabled={busy} onClick={()=>setStep('face')}>Continue this check-in</button><button className="wr-patient-secondary" disabled={busy} onClick={()=>void reset()}>End this session</button></div></>}
    {step==='about'&&<><h1>A little about you</h1><p>A preferred name or demo alias is optional. Your visit label keeps your information together.</p><form noValidate onSubmit={e=>{e.preventDefault();if(!consent&&!createInput.current){setError('Choose camera consent to continue, or use Continue without camera consent for assistance.');return;}void create(createInput.current?.consent??consent);}}>
      <label htmlFor="patient-name">Preferred name or demo alias</label><input id="patient-name" maxLength={80} autoComplete="off" value={name} disabled={busy||createInput.current!==null} onChange={e=>setName(e.target.value)}/>
      <p className="wr-patient-note">With your permission, the laptop camera can enroll your face and help staff connect later observations to this visit. Matching can be uncertain. This prototype does not diagnose illness.</p>
      <label className="wr-patient-checkbox"><input type="checkbox" checked={consent} disabled={busy||createInput.current!==null} onChange={e=>setConsent(e.target.checked)}/><span>I agree to face enrollment and camera monitoring for this demo.</span></label>
      <div className="wr-patient-actions"><button disabled={busy}>{busy?'Saving…':createInput.current?'Retry saving this check-in':'Save and continue'}</button><button className="wr-patient-secondary" disabled={busy||createInput.current!==null} type="button" onClick={()=>void create(false)}>Continue without camera consent</button></div></form></>}
    {visit&&step==='face'&&<><p className="wr-patient-visit">{visit.label}</p><h1>Face enrollment</h1>
      {visit.consentAtMs!==null?<><IdentitySetup/>{!enrolled&&<FaceEnrollment visitId={visit.id} nowMs={Date.now} onBusy={setFaceBusy} onEnrolled={setFaceReceipt}/>} {enrolled&&<p role="status">Face scan saved for this visit. Recognition can still be uncertain.</p>}</>:<div className="wr-patient-note"><p>You did not agree to camera enrollment. Ask the operator for assistance.</p></div>}
      {!enrolled&&<div className="wr-patient-note"><h2>{vision.adapter&&vision.calibration?'Face scan not saved yet.':'Face recognition is not available.'}</h2><p>Until a scan is saved, staff will need to assist with identifying you. You may continue with identity unavailable.</p></div>}
      <div className="wr-patient-actions"><button disabled={faceBusy} onClick={()=>{setError(null);setStep('handoff');}}>{enrolled?'Continue with face scan saved':'Continue with identity unavailable'}</button><button className="wr-patient-secondary" disabled={busy} onClick={()=>void reset()}>End this check-in</button></div></>}
    {visit&&step==='handoff'&&<><p className="wr-patient-visit">{visit.label}</p><h1>Continue on your phone</h1><p>Use one phone for the questions and fingertip pulse reading. Match this visit label before connecting.</p>
      {!qrReady&&<p className="wr-patient-note">Phone connection is not configured. Ask the operator to set up a phone-accessible trusted HTTPS address. You can answer the questions here.</p>}
      {grant&&!expired&&<section aria-label="Phone connection"><img className="wr-patient-qr" src={grant.image} alt="Scan to open your patient check-in on your phone"/><p>Or enter this code on the configured patient page:</p><p className="wr-patient-code">{grant.code}</p><p className="wr-patient-hint">One use. Expires at {new Date(grant.expiresAtMs).toLocaleTimeString()}. The phone will ask you to confirm your visit.</p></section>}
      {expired&&<p role="status">This code has expired. If your phone is already connected, continue there. Otherwise ask for a replacement connection.</p>}
      {visit.answers&&<p role="status">Your answers are saved.</p>}
      <div className="wr-patient-actions">{!grant?<button disabled={busy||!qrReady} onClick={()=>void pair()}>{busy?'Creating code…':'Create phone code'}</button>:<button className="wr-patient-secondary" disabled={busy} onClick={()=>setReplacing(true)}>Replace phone connection</button>}<button className="wr-patient-secondary" disabled={busy} onClick={()=>void questions()}>{takeoverRequired?'Take over questions on this screen':'Answer on this screen'}</button></div>
      {replacing&&<section className="wr-patient-note"><h2>Replace this phone connection?</h2><p>The previous phone will lose access, and any unfinished pulse capture will be cancelled. Saved answers remain.</p><button disabled={busy} onClick={()=>{pairId.current=null;void pair();}}>Confirm replacement</button><button className="wr-patient-secondary" onClick={()=>setReplacing(false)}>Keep current phone</button></section>}
      <p className="wr-patient-hint">No phone? Answer here, then ask to use the designated demo phone. Compatibility and a usable pulse are not guaranteed.</p></>}
    {visit&&step==='questions'&&<><p className="wr-patient-visit">{visit.label}</p><QuestionnaireForm key={visit.id} visit={visit} draft={draft.current} onDraft={value=>{draft.current=value;}} save={api.kioskSaveQuestionnaire} onBusy={setBusy} onSaved={value=>{draft.current=null;setVisit(value);setStep('saved');}} onAuthorityError={e=>{if(e instanceof ApiError&&e.code==='EDITOR_CONFLICT'){setTakeoverRequired(true);setStep('handoff');}}} onBack={()=>setStep('handoff')}/></>}
    {visit&&step==='saved'&&<><h1>Your answers are saved.</h1><p className="wr-patient-visit">{visit.label}</p><p>Your original answers have been kept. You can continue on a phone for a pulse reading or finish with that measurement unavailable.</p><dl className="wr-patient-status"><dt>Face enrollment</dt><dd>{enrolled?'Saved for this session':'Unavailable — staff assistance needed'}</dd><dt>Contact pulse</dt><dd>Not confirmed on this screen</dd></dl><div className="wr-patient-actions"><button disabled={busy||finishId.current!==null} onClick={()=>setStep('handoff')}>Continue on phone for pulse</button><button className="wr-patient-secondary" disabled={busy} onClick={()=>void finish()}>{busy?'Finishing…':finishId.current?'Retry finish check-in':'Finish with pulse unavailable'}</button><button className="wr-patient-secondary" disabled={busy||finishId.current!==null} onClick={()=>setStep('questions')}>Back to answers</button></div></>}
    {step==='complete'&&receipt&&<><h1>You’re checked in.</h1><p className="wr-patient-visit">{receipt.label}</p><p>Please take a seat. Your check-in has ended. {completedFaceSaved?'A face scan was saved during this check-in. Recognition may still be uncertain.':'Face enrollment is not confirmed on this screen; ask staff for identity assistance.'}</p><p>Pulse status: not confirmed on this screen. Completion is not a medical assessment.</p><div className="wr-patient-actions"><button disabled={busy} onClick={()=>void reset()}>Clear screen for next person</button></div></>}
    {step==='reset-failed'&&<><h1>This check-in screen is closed</h1><p>Personal details have been cleared from the screen. Saved records are kept.</p><button disabled={busy} onClick={()=>void reset()}>{busy?'Ending session…':'Retry ending session'}</button></>}
  </PatientShell>;
}
