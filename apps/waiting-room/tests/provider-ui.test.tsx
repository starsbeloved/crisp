// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuestionnaireForm } from '../client/patient/QuestionnaireForm.tsx';
import { PatientPage } from '../client/patient/PatientPage.tsx';
import type { Visit } from '../shared/contracts.ts';
const visit:Visit={id:'visit',label:'Patient 001',preferredName:null,consentAtMs:1,completedAtMs:null,createdAtMs:1,answers:null,summary:null,assignedSeat:null};
const proposal={complaint:'Reported: Original words',onset:'Today, reported',course:'Staying the same, reported',confirmed:false};
afterEach(()=>{cleanup();vi.unstubAllGlobals();window.sessionStorage.clear();window.history.replaceState(null,'','/');});
function fill(){fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Original words'}});}
it('reviews/edits an unconfirmed proposal and saves originals only after explicit summary confirmation',async()=>{
  const summarize=vi.fn(async()=>proposal);const save=vi.fn(async input=>({...visit,...input}));
  render(<QuestionnaireForm visit={visit} save={save} onSaved={vi.fn()} summarize={summarize}/>);fill();
  fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));
  const complaint=await screen.findByLabelText('Reported reason summary');expect((complaint as HTMLTextAreaElement).value).toBe(proposal.complaint);
  expect(save).not.toHaveBeenCalled();expect(screen.getByText('Proposed summary — not confirmed')).toBeTruthy();
  fireEvent.change(complaint,{target:{value:'My corrected summary'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm summary and save answers'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(save.mock.calls[0][0]).toMatchObject({answers:{reason:'Original words'},summary:{...proposal,complaint:'My corrected summary',confirmed:true}});
});
it('keeps the original-answer save path when summary fails and propagates authority loss',async()=>{
  const authority=vi.fn(),save=vi.fn(async input=>({...visit,...input}));
  const {ApiError}=await import('../client/runtime/api.ts');const summarize=vi.fn(async()=>{throw new ApiError(409,'EDITOR_CONFLICT','Editing moved');});
  render(<QuestionnaireForm visit={visit} save={save} onSaved={vi.fn()} onAuthorityError={authority} summarize={summarize}/>);fill();
  fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));expect(await screen.findByRole('alert')).toBeTruthy();expect(authority).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(save.mock.calls[0][0].summary).toBeUndefined();expect(save.mock.calls[0][0].answers.reason).toBe('Original words');
});
it('aborts a pending summary on original changes and cannot confirm a stale result',async()=>{
  let complete!:(v:typeof proposal)=>void;let child:AbortSignal|undefined;
  const summarize=vi.fn(async(_id:string,_answers:unknown,signal:AbortSignal)=>{child=signal;return new Promise<typeof proposal>(resolve=>complete=resolve);});
  render(<QuestionnaireForm visit={visit} save={vi.fn()} onSaved={vi.fn()} summarize={summarize}/>);fill();fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Updated originals'}});expect(child?.aborted).toBe(true);
  await act(async()=>complete(proposal));expect(screen.queryByLabelText('Reported reason summary')).toBeNull();expect((screen.getByLabelText('What brings you here today?') as HTMLTextAreaElement).value).toBe('Updated originals');
});
it('retries an identical confirmed save after transport failure and drops confirmation after original edits',async()=>{
  const save=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({...visit,answers:{reason:'Original words',onset:'not-sure',onsetNote:'',course:'not-applicable'},summary:{...proposal,confirmed:true}});
  render(<QuestionnaireForm visit={visit} save={save} onSaved={vi.fn()} summarize={async()=>proposal}/>);fill();fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));await screen.findByLabelText('Reported reason summary');
  fireEvent.click(screen.getByRole('button',{name:'Confirm summary and save answers'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry saving answers'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Changed'}});expect(screen.queryByLabelText('Reported reason summary')).toBeNull();
});
it('cancels summary on unmount and rejects an AI-self-confirmed response',async()=>{
  const {unmount}=render(<QuestionnaireForm visit={visit} save={vi.fn()} onSaved={vi.fn()} summarize={async()=>({...proposal,confirmed:true})}/>);fill();fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByRole('button',{name:'Confirm summary and save answers'})).toBeNull();unmount();
});
it('cancels pending summary generation on Back/unmount and announces proposal readiness',async()=>{
  let child:AbortSignal|undefined;
  const {unmount}=render(<QuestionnaireForm visit={visit} save={vi.fn()} onSaved={vi.fn()} summarize={async(_id,_answers,signal)=>{child=signal;return new Promise(()=>{});}}/>);fill();fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));unmount();expect(child?.aborted).toBe(true);
  render(<QuestionnaireForm visit={visit} save={vi.fn()} onSaved={vi.fn()} summarize={async()=>proposal}/>);fill();fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));await screen.findByLabelText('Reported reason summary');
  expect(screen.getByRole('status').textContent).toContain('Summary ready for your review');
});
it('connects patient summary endpoint to explicit confirmation, save and confirmed readback without replacing originals',async()=>{
  let current={...visit};const calls:{url:string;input:any}[]=[];
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    const input=JSON.parse(String(init.body??'{}'));calls.push({url,input});
    if(url.endsWith('/patient/session'))return Response.json({visit:current,expiresAtMs:Date.now()+600000,canEditQuestionnaire:true});
    if(url.endsWith('/questionnaire-summary'))return Response.json(proposal);
    if(url.endsWith('/questionnaire')){current={...current,answers:input.answers,summary:input.summary};return Response.json(current);}
    throw Error('Unexpected route');
  });
  render(<PatientPage/>);fireEvent.click(await screen.findByRole('button',{name:'Yes, this is my check-in'}));fill();fireEvent.click(screen.getByRole('button',{name:'Review AI summary'}));
  await screen.findByLabelText('Reported reason summary');fireEvent.click(screen.getByRole('button',{name:'Confirm summary and save answers'}));
  expect(await screen.findByRole('heading',{name:'Your confirmed summary'})).toBeTruthy();expect(current.answers?.reason).toBe('Original words');expect(current.summary?.confirmed).toBe(true);
  expect(calls.find(v=>v.url.endsWith('/questionnaire-summary'))?.input).toMatchObject({visitId:visit.id,answers:{reason:'Original words'}});
});
