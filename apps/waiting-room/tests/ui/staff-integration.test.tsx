// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StaffPage } from '../../client/staff/StaffPage.tsx';
import { openRequestRoom } from '../../shared/fixtures.ts';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();sessionStorage.clear();});
it('mounts authenticated shared video and cancels a real pending voice explanation before a nurse action resolves',async()=>{
  const room=structuredClone(openRequestRoom);
  let explanationSignal:AbortSignal|undefined,mediaRegistered=false;
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/station'))return Response.json({ok:true});
    if(url.endsWith('/room'))return Response.json(room);
    if(url.endsWith('/media')){mediaRegistered=true;return Response.json({events:[]});}
    if(url.endsWith('/explain')){explanationSignal=init?.signal as AbortSignal;return new Promise<Response>(()=>{});}
    if(url.endsWith('/acknowledge'))return new Promise<Response>(()=>{});
    throw Error('Unexpected integration endpoint');
  });
  render(<StaffPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Open local staff view'}));
  expect(await screen.findByRole('heading',{name:'Staff voice notifications'})).toBeTruthy();
  expect(screen.getByRole('region',{name:'Shared room camera'})).toBeTruthy();
  await waitFor(()=>{expect(mediaRegistered).toBe(true);expect(explanationSignal).toBeDefined();});
  expect(explanationSignal?.aborted).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Acknowledge'}));
  await waitFor(()=>expect(explanationSignal?.aborted).toBe(true));
  expect(screen.getByText('Saving…')).toBeTruthy();
  expect(screen.queryByText('Live monitoring is not connected.')).toBeNull();
});
it('edits an optional assigned seat without relabeling the observed camera location',async()=>{
  const room=structuredClone(openRequestRoom);let saved:unknown;
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/station'))return Response.json({ok:true});
    if(url.endsWith('/room'))return Response.json(room);
    if(url.endsWith('/media'))return Response.json({events:[]});
    if(url.endsWith('/seat')){saved=JSON.parse(String(init?.body));return Response.json({...room.visits[0],assignedSeat:{label:'C2',assignedAtMs:room.serverNowMs}});}
    return Response.json({error:{code:'UNAVAILABLE',message:'Synthetic boundary'}},{status:503});
  });
  render(<StaffPage/>);fireEvent.click(screen.getByRole('button',{name:'Open local staff view'}));
  fireEvent.click(await screen.findByRole('button',{name:/Patient 014 ·/}));
  fireEvent.change(screen.getByRole('textbox',{name:'Assigned seat (optional)'}),{target:{value:'C2'}});
  fireEvent.click(screen.getByRole('button',{name:'Save assigned seat'}));
  expect(await screen.findByText('Assigned seat: C2')).toBeTruthy();
  expect(saved).toMatchObject({label:'C2'});
  expect(screen.getByText('Current location: B4',{selector:'.wr-dashboard__panel > p'})).toBeTruthy();
});
