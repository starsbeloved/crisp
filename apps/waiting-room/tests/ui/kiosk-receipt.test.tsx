// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CheckInPage } from '../../client/check-in/CheckInPage.tsx';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows phone completion from the minimal receipt without retrieving completed answers',async()=>{
  let reads=0;
  const visit={id:'visit_receipt',label:'Patient 031',createdAtMs:100,answers:null,summary:null,assignedSeat:null,preferredName:null,consentAtMs:null,completedAtMs:null};
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url.endsWith('/kiosk'))return Response.json({ok:true});
    if(url.endsWith('/kiosk/session'))return Response.json(++reads===1?{visit}:{visit:null,receipt:{visitId:visit.id,label:visit.label,completedAtMs:200}});
    throw Error('Unexpected request');
  });
  render(<CheckInPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Start check-in'}));
  fireEvent.click(await screen.findByRole('button',{name:'Continue this check-in'}));
  fireEvent.click(screen.getByRole('button',{name:'Continue with identity unavailable'}));
  expect(await screen.findByRole('heading',{name:'You’re checked in.'},{timeout:4500})).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
