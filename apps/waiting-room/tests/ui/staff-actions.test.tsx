// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StaffPage } from '../../client/staff/StaffPage.tsx';
import { openRequestRoom } from '../../shared/fixtures.ts';

afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('persists nurse actions and retries a lost acknowledgement using the same request key', async()=>{
  const room=structuredClone(openRequestRoom);
  const previous=structuredClone(room);
  const keys:string[]=[];
  let fail=true;
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    if(url.endsWith('/station'))return Response.json({ok:true});
    // Simulate a lost response plus a delayed read replica, so the explicit
    // retry is exercised before a poll can independently confirm the commit.
    if(url.endsWith('/room'))return Response.json(keys.length<2?previous:room);
    const input=JSON.parse(String(init.body));
    if(url.endsWith('/acknowledge')){
      keys.push(input.requestId);
      room.requests[0].state='acknowledged';
      if(fail){fail=false;throw Error('Lost response after commit');}
      return Response.json(room.requests[0]);
    }
    if(url.endsWith('/check')){
      room.requests[0].state='checked';
      return Response.json({request:room.requests[0],referenceControl:null});
    }
    throw Error('Unexpected endpoint');
  });
  render(<StaffPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Open local staff view'}));
  fireEvent.click(await screen.findByRole('button',{name:'Acknowledge'}));
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Acknowledge'}));
  expect(await screen.findByRole('button',{name:/Acknowledged · Patient/})).toBeTruthy();
  expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
  fireEvent.click(screen.getByRole('button',{name:'Mark checked'}));
  expect(await screen.findByRole('button',{name:/Checked · Patient/})).toBeTruthy();
  await waitFor(()=>expect((screen.getByRole('button',{name:'Mark checked'}) as HTMLButtonElement).disabled).toBe(true));
});
it('ages current evidence to stale when the next room request hangs',async()=>{
  vi.useFakeTimers();let reads=0;
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url.endsWith('/station'))return Response.json({ok:true});
    if(++reads<=2)return Response.json(openRequestRoom);
    return new Promise<Response>(()=>{});
  });
  render(<StaffPage/>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Open local staff view'}));});
  fireEvent.click(screen.getByRole('button',{name:/Patient 014 ·/}));
  expect(screen.getByRole('heading',{name:'Camera pulse'}).parentElement?.textContent).toContain('72 bpm');
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
  expect(screen.getByText(/No fresh service snapshot/)).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Camera pulse'}).parentElement?.textContent).toContain('— bpm');
  expect(screen.getByText('Disconnected · saved snapshot only')).toBeTruthy();
});
