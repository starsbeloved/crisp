// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PatientPage } from '../../client/patient/PatientPage.tsx';
import { CheckInPage } from '../../client/check-in/CheckInPage.tsx';
import { patientPhoneLink } from '../../client/check-in/phone-link.ts';
import type { Visit } from '../../shared/contracts.ts';

const base:Visit={id:'visit_self',label:'Patient 021',preferredName:'Sam',consentAtMs:100,completedAtMs:null,createdAtMs:100,answers:null,summary:null,assignedSeat:null};
const failure=(code:string,message:string,status=401)=>Response.json({error:{code,message}},{status});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();window.history.replaceState(null,'','/');window.sessionStorage.clear();});
function phone({saved=false,failSave=false,failFinish=false,rejectFinish=false,expires=Date.now()+900000}={}) {
  let joined=false,revoked=false,saveFailed=false,finishFailed=false;
  let visit:Visit={...base,answers:saved?{reason:'Original words',onset:'today',onsetNote:'',course:'same'}:null};
  const writes:{url:string;input:any}[]=[];
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    const input=JSON.parse(String(init.body??'{}'));writes.push({url,input});
    if(url.endsWith('/join')){joined=true;return Response.json({visitId:visit.id,purpose:'patient'});}
    if(url.endsWith('/patient/session'))return joined&&!revoked?Response.json({visit,expiresAtMs:expires,canEditQuestionnaire:true}):failure('SESSION_REQUIRED','No active check-in');
    if(url.endsWith('/questionnaire')){
      if(failSave&&!saveFailed){saveFailed=true;return failure('SERVICE_UNAVAILABLE','Could not save answers. Try again.',503);}
      visit={...visit,answers:input.answers};return Response.json(visit);
    }
    if(url.endsWith('/patient/finish')){
      if(rejectFinish)return failure('CAPTURE_ACTIVE','Stop or save the active measurement first',409);
      if(failFinish&&!finishFailed){finishFailed=true;throw Error('Connection lost after possible commit');}
      return Response.json({visitId:visit.id,label:visit.label,completedAtMs:200});
    }
    throw Error(`Unexpected patient endpoint ${url}`);
  });return {writes,getVisit:()=>visit,revoke:()=>{revoked=true;}};
}
async function connect(){
  fireEvent.change(screen.getByLabelText('Check-in code'),{target:{value:'12345678'}});
  fireEvent.click(screen.getByRole('button',{name:'Connect to my visit'}));
  fireEvent.click(await screen.findByRole('button',{name:'Yes, this is my check-in'}));
}
async function kioskToFace(){
  fireEvent.click(screen.getByRole('button',{name:'Start check-in'}));
  fireEvent.change(await screen.findByLabelText('Preferred name or demo alias'),{target:{value:'Sam'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Save and continue'}));
  await screen.findByText('Patient 021');
}
function kiosk({existing=null as Visit|null,failCreate=false,failReset=false}={}) {
  let visit:Visit|null=existing,createFailed=false,resetFailed=false;
  const writes:{url:string;input:any}[]=[];
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    const input=JSON.parse(String(init.body??'{}'));writes.push({url,input});
    if(url.endsWith('/kiosk'))return Response.json({ok:true});
    if(url.endsWith('/kiosk/session'))return Response.json({visit});
    if(url.endsWith('/kiosk/visit')){
      if(failCreate&&!createFailed){createFailed=true;throw Error('Offline');}
      visit={...base,preferredName:input.preferredName??null,consentAtMs:input.consent?100:null};return Response.json(visit);
    }
    if(url.endsWith('/kiosk/questionnaire')){visit={...visit!,answers:input.answers};return Response.json(visit);}
    if(url.endsWith('/kiosk/takeover'))return Response.json({ok:true});
    if(url.endsWith('/kiosk/pair'))return Response.json({code:'12345678',expiresAtMs:Date.now()+60000});
    if(url.endsWith('/kiosk/reset')){
      if(failReset&&!resetFailed){resetFailed=true;return failure('SERVICE_UNAVAILABLE','Could not end session',503);}
      visit=null;return Response.json({ok:true});
    }
    throw Error(`Unexpected kiosk endpoint ${url}`);
  });return {writes};
}

it('rejects phone QR origins that would point at a phone localhost or an insecure address',()=>{
  for(const origin of [undefined,'http://192.168.1.2','https://localhost:5173','https://127.0.0.1','https://[::1]','https://localhost.example/other','https://user:pass@example.org'])expect(patientPhoneLink(origin,'12345678')).toBeNull();
  expect(patientPhoneLink('https://checkin.example.org:8443','12345678')).toBe('https://checkin.example.org:8443/patient#code=12345678');
});
it('retains unsaved original answers across Back and never starts a capture while answering',async()=>{
  const h=phone();render(<StrictMode><PatientPage/></StrictMode>);await connect();
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'These are my own words'}});
  fireEvent.click(screen.getByRole('button',{name:'Back'}));
  fireEvent.click(screen.getByRole('button',{name:'Yes, this is my check-in'}));
  expect((screen.getByLabelText('What brings you here today?') as HTMLTextAreaElement).value).toBe('These are my own words');
  expect(h.writes.some(w=>w.url.includes('/capture')||w.url.includes('/clock'))).toBe(false);
});
it('keeps a failed questionnaire and retries the same request and original values',async()=>{
  const h=phone({failSave:true});render(<PatientPage/>);await connect();
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'  My original words  '}});
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Retry saving answers'}));
  expect(await screen.findByRole('heading',{name:'Your answers are saved.'})).toBeTruthy();
  const writes=h.writes.filter(w=>w.url.endsWith('/questionnaire'));
  expect(writes).toHaveLength(2);expect(writes[1].input).toEqual(writes[0].input);
  expect(h.getVisit().answers?.reason).toBe('  My original words  ');
});
it('focuses a linked validation summary and does not send an empty reason',async()=>{
  const h=phone();render(<PatientPage/>);await connect();
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));
  expect(screen.getByRole('alert')).toBe(document.activeElement);
  expect(screen.getByRole('link',{name:'Go to what brings you here'}).getAttribute('href')).toBe('#patient-reason');
  expect(screen.getByLabelText('What brings you here today?').getAttribute('aria-invalid')).toBe('true');
  expect(h.writes.filter(w=>w.url.endsWith('/questionnaire'))).toHaveLength(0);
  screen.getByRole('button',{name:'Save answers'}).focus();
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));
  expect(screen.getByRole('alert')).toBe(document.activeElement);
});
it('finishes without a pulse and retries a lost completion with the same request, then hides answers',async()=>{
  const h=phone({saved:true,failFinish:true});render(<PatientPage/>);await connect();
  fireEvent.click(screen.getByRole('button',{name:'Continue with original answers'}));
  await screen.findByRole('button',{name:'Start camera capture'});
  expect(screen.getAllByRole('main')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Continue with pulse unavailable'}));
  fireEvent.click(screen.getByRole('button',{name:'Finish check-in'}));
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Retry finish check-in'}));
  expect(await screen.findByRole('heading',{name:'You’re checked in.'})).toBeTruthy();
  const writes=h.writes.filter(w=>w.url.endsWith('/patient/finish'));expect(writes).toHaveLength(2);expect(writes[1].input).toEqual(writes[0].input);
  expect(screen.queryByText('Original words')).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();
  expect(h.writes.filter(w=>w.url.endsWith('/join'))).toHaveLength(1);
  cleanup();render(<PatientPage/>);
  expect(screen.getByRole('heading',{name:'This check-in has ended.'})).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('allows returning to pulse when the server definitively rejects completion',async()=>{
  phone({saved:true,rejectFinish:true});render(<PatientPage/>);await connect();
  fireEvent.click(screen.getByRole('button',{name:'Continue with original answers'}));
  await screen.findByRole('button',{name:'Start camera capture'});
  fireEvent.click(screen.getByRole('button',{name:'Continue with pulse unavailable'}));
  fireEvent.click(screen.getByRole('button',{name:'Finish check-in'}));
  await screen.findByRole('alert');
  expect(screen.getByRole('button',{name:'Back to pulse'}).hasAttribute('disabled')).toBe(false);
});
it('opens and closes help with honest assistance text and restores focus',()=>{
  render(<CheckInPage/>);
  const help=screen.getByRole('button',{name:'I need help'});help.focus();fireEvent.click(help);
  expect(screen.getByRole('dialog').textContent).toContain('No notification has been sent.');
  fireEvent.click(screen.getByRole('button',{name:'Return to check-in'}));
  expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(help);
});
it('clears a patient session at expiry and does not show its original answers',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});
  const expires=Date.now()+5000;phone({expires});render(<PatientPage/>);await connect();
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Private draft'}});
  vi.setSystemTime(expires+1000);await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(screen.getByRole('heading',{name:'This check-in has ended.'})).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByDisplayValue('Private draft')).toBeNull();
});
it('notices server-side re-pairing or revocation without retaining the old questionnaire',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});const h=phone();render(<PatientPage/>);await connect();
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Old phone draft'}});
  h.revoke();await act(async()=>{await vi.advanceTimersByTimeAsync(11000);});
  expect(screen.getByRole('heading',{name:'This check-in has ended.'})).toBeTruthy();
  expect(screen.queryByDisplayValue('Old phone draft')).toBeNull();
});
it('ignores a delayed successful answer-save response after the session expires',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});const expires=Date.now()+5000;phone({expires});
  const transport=globalThis.fetch;let release!:(response:Response)=>void;
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>url.endsWith('/questionnaire')?new Promise<Response>(resolve=>{release=resolve;}):transport(url,init));
  render(<PatientPage/>);await connect();
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Private delayed answer'}});
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(6000);});
  expect(screen.getByRole('heading',{name:'This check-in has ended.'})).toBeTruthy();
  await act(async()=>{release(Response.json({...base,answers:{reason:'Private delayed answer',onset:'today',onsetNote:'',course:'same'}}));});
  expect(screen.getByRole('heading',{name:'This check-in has ended.'})).toBeTruthy();
  expect(screen.queryByText('Patient 021')).toBeNull();
});
it('retries kiosk creation with the identical name, consent and request ID',async()=>{
  const h=kiosk({failCreate:true});render(<CheckInPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Start check-in'}));
  fireEvent.change(await screen.findByLabelText('Preferred name or demo alias'),{target:{value:'Sam'}});
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Save and continue'}));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Retry saving this check-in'}));
  await screen.findByText('Patient 021');
  const creates=h.writes.filter(w=>w.url.endsWith('/kiosk/visit'));expect(creates).toHaveLength(2);expect(creates[1].input).toEqual(creates[0].input);
});
it('offers the no-phone path with unavailable identity and keeps saved originals',async()=>{
  const h=kiosk();render(<CheckInPage/>);await kioskToFace();
  expect(screen.getByText('Face recognition is not available.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue with identity unavailable'}));
  expect(screen.getByRole('button',{name:'Create phone code'}).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Answer on this screen'}));
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'My knee hurts'}});
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));
  expect(await screen.findByRole('heading',{name:'Your answers are saved.'})).toBeTruthy();
  expect(h.writes.find(w=>w.url.endsWith('/kiosk/questionnaire'))?.input.answers.reason).toBe('My knee hurts');
  expect(h.writes.some(w=>w.url.endsWith('/station')||w.url.endsWith('/room'))).toBe(false);
});
it('creates a visit-specific QR only at an explicit HTTPS origin and hides the expired code',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});const h=kiosk();render(<CheckInPage phoneOrigin="https://checkin.example.org"/>);await kioskToFace();
  fireEvent.click(screen.getByRole('button',{name:'Continue with identity unavailable'}));
  fireEvent.click(screen.getByRole('button',{name:'Create phone code'}));
  const qr=await screen.findByRole('img',{name:'Scan to open your patient check-in on your phone'});
  expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  expect(screen.getByText('12345678')).toBeTruthy();
  expect(h.writes.filter(w=>w.url.endsWith('/kiosk/pair'))).toHaveLength(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(61000);});
  expect(screen.queryByRole('img',{name:'Scan to open your patient check-in on your phone'})).toBeNull();
  expect(screen.queryByText('12345678')).toBeNull();
});
it('can decline camera consent and continue as an incomplete visit without opening any camera',async()=>{
  const h=kiosk();render(<CheckInPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Start check-in'}));
  fireEvent.click(await screen.findByRole('button',{name:'Continue without camera consent'}));
  expect(await screen.findByText('You did not agree to camera enrollment. Ask the operator for assistance.')).toBeTruthy();
  expect(h.writes.find(w=>w.url.endsWith('/kiosk/visit'))?.input.consent).toBe(false);
  expect(screen.queryByRole('video')).toBeNull();
});
it('requires explicit takeover and reloads committed answers when resuming an unfinished visit',async()=>{
  const h=kiosk({existing:{...base,answers:{reason:'Previously saved',onset:'today',onsetNote:'',course:'same'}}});render(<CheckInPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Start check-in'}));
  fireEvent.click(await screen.findByRole('button',{name:'Continue this check-in'}));
  fireEvent.click(screen.getByRole('button',{name:'Continue with identity unavailable'}));
  fireEvent.click(screen.getByRole('button',{name:'Take over questions on this screen'}));
  await screen.findByLabelText('What brings you here today?');
  expect(h.writes.filter(w=>w.url.endsWith('/kiosk/takeover'))).toHaveLength(1);
  expect((screen.getByLabelText('What brings you here today?') as HTMLTextAreaElement).value).toBe('Previously saved');
});
it('warns before inactivity reset and blocks the next patient until failed revocation is retried',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});
  const h=kiosk({failReset:true});render(<CheckInPage/>);await kioskToFace();
  await act(async()=>{await vi.advanceTimersByTimeAsync(121000);});
  expect(screen.getByRole('heading',{name:'Do you need more time?'})).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
  expect(screen.queryByText('Patient 021')).toBeNull();expect(screen.queryByRole('button',{name:'Start check-in'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Retry ending session'}));
  await act(async()=>{});
  expect(screen.getByRole('button',{name:'Start check-in'})).toBeTruthy();
  const resets=h.writes.filter(w=>w.url.endsWith('/kiosk/reset'));expect(resets).toHaveLength(2);expect(resets[1].input).toEqual(resets[0].input);
});
