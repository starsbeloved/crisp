// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../client/App.tsx';
import { emptyRoom } from '../../shared/fixtures.ts';
const visit = {id:'visit_self',label:'Patient 021',preferredName:'Sam',consentAtMs:100,completedAtMs:null,createdAtMs:100,answers:null,summary:null,assignedSeat:null};
beforeEach(()=>{vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('saves kiosk identity and answers without pretending face enrollment or pulse succeeded', async()=>{
  let saved:any={...visit};
  vi.stubGlobal('fetch',async (url:string, init:RequestInit)=>{
    const input=init.body?JSON.parse(String(init.body)):{};
    if(url.endsWith('/kiosk'))return Response.json({ok:true});
    if(url.endsWith('/kiosk/session'))return Response.json({visit:null});
    if(url.endsWith('/kiosk/visit')){expect(input.preferredName).toBe('Sam');expect(input.consent).toBe(true);return Response.json(saved,{status:201});}
    if(url.endsWith('/kiosk/questionnaire')){saved={...saved,answers:input.answers};return Response.json(saved);}
    throw Error(`Unexpected route ${url}`);
  });
  render(<App pathname="/check-in"/>);
  fireEvent.click(screen.getByRole('button',{name:'Start check-in'}));
  fireEvent.change(await screen.findByLabelText('Preferred name or demo alias'),{target:{value:'Sam'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Save and continue'}));
  expect(await screen.findByText('Patient 021')).toBeTruthy();
  expect(screen.getByText(/Face recognition is not available/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue with identity unavailable'}));
  fireEvent.click(screen.getByRole('button',{name:'Answer on this screen'}));
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Dizzy today'}});
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));
  expect(await screen.findByText('Your answers are saved.')).toBeTruthy();
  expect(saved.answers.reason).toBe('Dizzy today');
  expect(screen.queryByText(/temperature/i)).toBeNull();
  expect(screen.queryByText(/face scan saved/i)).toBeNull();
});
it('keeps answers and shows an actionable error when a save fails', async()=>{
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url.endsWith('/join'))return Response.json({visitId:visit.id,purpose:'patient'});
    if(url.endsWith('/patient/session'))return Response.json({visit,expiresAtMs:Date.now()+60000,canEditQuestionnaire:true});
    return Response.json({error:{code:'SERVICE_UNAVAILABLE',message:'Could not save answers. Try again.'}},{status:503});
  });
  render(<App pathname="/patient"/>);
  fireEvent.change(screen.getByLabelText('Check-in code'),{target:{value:'12345678'}});
  fireEvent.click(screen.getByRole('button',{name:'Connect to my visit'}));
  fireEvent.click(await screen.findByRole('button',{name:'Yes, this is my check-in'}));
  fireEvent.change(screen.getByLabelText('What brings you here today?'),{target:{value:'Keep these words'}});
  fireEvent.click(screen.getByRole('button',{name:'Save answers'}));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByLabelText('What brings you here today?') as HTMLTextAreaElement).value).toBe('Keep these words');
});
it('shows real nurse readback as unavailable sensing, never the synthetic default patient',async()=>{
  vi.stubGlobal('fetch',async(url:string)=>url.endsWith('/station')?Response.json({ok:true}):Response.json({...emptyRoom,visits:[visit]}));
  render(<App pathname="/staff"/>);
  fireEvent.click(screen.getByRole('button',{name:'Open local staff view'}));
  expect(await screen.findByRole('button',{name:/Patient 021/})).toBeTruthy();
  expect(screen.queryByText('Patient 014')).toBeNull();
  expect(screen.getByText(/Waiting for the single camera owner/)).toBeTruthy();
});
