import { useEffect, useRef, useState } from 'react';
import type { Answers, QuestionnaireSummary, Visit } from '../../shared/contracts.ts';
import { summarySchema } from '../../shared/schemas.ts';
import { providerClient } from '../staff/provider-client.ts';
import { ErrorNotice } from './PatientShell.tsx';

export type QuestionnaireInput={requestId:string;answers:Answers;summary?:QuestionnaireSummary};
export function QuestionnaireForm({visit,save,onSaved,onBusy,onAuthorityError,onBack,draft,onDraft,summarize=providerClient.summarizeQuestionnaire}:{visit:Visit;save:(input:QuestionnaireInput)=>Promise<Visit>;onSaved:(visit:Visit)=>void;onBusy?:(busy:boolean)=>void;onAuthorityError?:(error:unknown)=>void;onBack?:()=>void;draft?:Answers|null;onDraft?:(answers:Answers)=>void;summarize?:(visitId:string,answers:Answers,signal:AbortSignal)=>Promise<QuestionnaireSummary>}) {
  const [answers,setAnswers]=useState<Answers>(()=>draft??visit.answers??{reason:'',onset:'not-sure',onsetNote:'',course:'not-applicable'});
  const [pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),[invalid,setInvalid]=useState(false);
  const [validationAttempt,setValidationAttempt]=useState(0);
  const [retry,setRetry]=useState<QuestionnaireInput|null>(null);
  const [summary,setSummary]=useState<QuestionnaireSummary|null>(()=>!draft&&visit.summary?{...visit.summary,confirmed:false}:null);
  const [generating,setGenerating]=useState(false),[summaryError,setSummaryError]=useState<string|null>(null);
  const summaryOperation=useRef<AbortController|null>(null),live=useRef(true),saveLock=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;summaryOperation.current?.abort();};},[]);
  const cancelSummary=()=>{summaryOperation.current?.abort();summaryOperation.current=null;setGenerating(false);onBusy?.(false);};
  const change=<K extends keyof Answers>(key:K,value:Answers[K])=>{cancelSummary();const next={...answers,[key]:value};setAnswers(next);onDraft?.(next);setRetry(null);setSummary(null);setSummaryError(null);};
  const valid=()=>{if(!answers.reason.trim()){setValidationAttempt(attempt=>attempt+1);setInvalid(true);setError('Tell us what brings you here. Your other answers are kept.');return false;}setInvalid(false);setError(null);return true;};
  const generate=async()=>{
    if(generating||pending||!valid())return;const controller=new AbortController();summaryOperation.current=controller;setGenerating(true);setSummaryError(null);onBusy?.(true);
    try{const value=await summarize(visit.id,{...answers},controller.signal);if(!live.current||controller.signal.aborted||summaryOperation.current!==controller)return;
      const parsed=summarySchema.safeParse(value);if(!parsed.success||parsed.data.confirmed)throw Error('The summary was invalid. You can save your original answers.');setSummary({...parsed.data,confirmed:false});setRetry(null);
    }catch(e){if(live.current&&!controller.signal.aborted&&summaryOperation.current===controller){setSummaryError('The AI summary is unavailable. Your original answers are kept; you can save them below.');onAuthorityError?.(e);}}
    finally{if(live.current&&summaryOperation.current===controller){summaryOperation.current=null;setGenerating(false);onBusy?.(false);}}
  };
  const submit=async(confirmSummary=false)=>{
    if(saveLock.current||!valid())return;saveLock.current=true;cancelSummary();
    setInvalid(false);setError(null);setPending(true);onBusy?.(true);
    const input=retry??{requestId:crypto.randomUUID(),answers:{...answers},...(confirmSummary&&summary?{summary:{...summary,confirmed:true}}:{})};setRetry(input);
    try {const saved=await save(input);if(!live.current)return;if(saved.id!==visit.id)throw Error('Saved answers did not match this visit. Ask the operator for help.');setRetry(null);onSaved(saved);}
    catch(e){if(live.current){setError(e instanceof Error?e.message:'Could not save answers. Try again.');onAuthorityError?.(e);}}
    finally{saveLock.current=false;if(live.current){setPending(false);onBusy?.(false);}}
  };
  return <section aria-labelledby="patient-questions-title"><h1 id="patient-questions-title">Three quick questions</h1><p>Your own words help staff understand your visit. This form does not use your camera.</p>
    <form noValidate onSubmit={e=>{e.preventDefault();void submit();}}>
      {error&&<ErrorNotice key={validationAttempt} message={error}>{invalid&&<a href="#patient-reason">Go to what brings you here</a>}</ErrorNotice>}
      <label htmlFor="patient-reason">What brings you here today?</label><textarea id="patient-reason" rows={4} maxLength={500} value={answers.reason} disabled={pending} aria-invalid={invalid||undefined} aria-describedby={invalid?'patient-reason-error patient-reason-hint':'patient-reason-hint'} onChange={e=>change('reason',e.target.value)}/>
      <p id="patient-reason-hint" className="wr-patient-hint">Up to 500 characters. {answers.reason.length}/500</p>{invalid&&<p id="patient-reason-error" className="wr-patient-field-error">Enter a short reason for your visit.</p>}
      <label htmlFor="patient-onset">When did this start?</label><select id="patient-onset" value={answers.onset} disabled={pending} onChange={e=>change('onset',e.target.value as Answers['onset'])}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="several-days">Several days ago</option><option value="longer">Longer ago</option><option value="not-sure">Not sure</option></select>
      <label htmlFor="patient-onset-note">Anything to add about when it started? <span className="wr-patient-hint">Optional</span></label><input id="patient-onset-note" maxLength={200} value={answers.onsetNote} disabled={pending} onChange={e=>change('onsetNote',e.target.value)}/>
      <label htmlFor="patient-course">How has it changed since it started?</label><select id="patient-course" value={answers.course} disabled={pending} onChange={e=>change('course',e.target.value as Answers['course'])}><option value="better">Getting better</option><option value="same">Staying the same</option><option value="worse">Getting worse</option><option value="intermittent">Comes and goes</option><option value="not-applicable">Not applicable</option></select>
      <p className="wr-patient-note">An optional AI summary can organize your answers. Review and correct it before confirming. Your original words are always saved separately.</p>
      {summaryError&&<ErrorNotice message={summaryError}/>}
      <div className="wr-patient-actions"><button type="button" className="wr-patient-secondary" disabled={pending||generating} onClick={()=>void generate()}>{generating?'Preparing summary…':summary?'Generate a new summary':'Review AI summary'}</button>{generating&&<button type="button" className="wr-patient-secondary" onClick={cancelSummary}>Cancel summary</button>}</div>
      {summary&&<section aria-labelledby="patient-summary-title"><h2 id="patient-summary-title">Review your summary</h2><p>Proposed summary — not confirmed</p>
        <label htmlFor="patient-summary-reason">Reported reason summary</label><textarea id="patient-summary-reason" rows={3} maxLength={500} value={summary.complaint} disabled={pending} onChange={e=>{setSummary({...summary,complaint:e.target.value,confirmed:false});setRetry(null);}}/>
        <label htmlFor="patient-summary-onset">Reported onset summary</label><input id="patient-summary-onset" maxLength={500} value={summary.onset} disabled={pending} onChange={e=>{setSummary({...summary,onset:e.target.value,confirmed:false});setRetry(null);}}/>
        <label htmlFor="patient-summary-course">Reported course summary</label><input id="patient-summary-course" maxLength={500} value={summary.course} disabled={pending} onChange={e=>{setSummary({...summary,course:e.target.value,confirmed:false});setRetry(null);}}/>
        <div className="wr-patient-actions"><button type="button" disabled={pending} onClick={()=>void submit(true)}>Confirm summary and save answers</button></div>
      </section>}
      <div className="wr-patient-actions"><button type="submit" disabled={pending}>{pending?'Saving answers…':retry?'Retry saving answers':'Save answers'}</button>{onBack&&<button type="button" className="wr-patient-secondary" disabled={pending} onClick={onBack}>Back</button>}</div>
      <p role="status">{pending?'Saving. Keep this screen open.':error?'Your answers are not confirmed saved.':generating?'Preparing an unconfirmed summary. You can cancel and save your originals.':summary?'Summary ready for your review. Nothing on this screen is confirmed saved yet.':'Answers on this screen have not been saved yet.'}</p>
    </form></section>;
}
