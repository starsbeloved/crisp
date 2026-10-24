// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PatientPage } from '../../client/patient/PatientPage.tsx';
import { usableRoom } from '../../shared/fixtures.ts';
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
it('restores only the own saved contact reading and does not declare laptop enrollment unavailable',async()=>{
  const visit=structuredClone(usableRoom.visits[0]);
  const measurement=structuredClone(usableRoom.measurements.find(m=>m.streamId==='phone')!);
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url.endsWith('/patient/session'))return Response.json({visit,expiresAtMs:Date.now()+900000,canEditQuestionnaire:true,contactMeasurement:measurement});
    return Response.json({error:{code:'UNAVAILABLE',message:'Synthetic boundary'}},{status:503});
  });
  render(<PatientPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Yes, this is my check-in'}));
  fireEvent.click(screen.getByRole('button',{name:'Continue with original answers'}));
  fireEvent.click(screen.getByRole('button',{name:'Continue with pulse unavailable'}));
  expect(await screen.findByText(/Saved to this visit · 72 bpm/)).toBeTruthy();
  expect(screen.getByText(/Confirm enrollment on the check-in laptop/)).toBeTruthy();
  expect(screen.queryByText('Unavailable — ask the operator for assistance')).toBeNull();
});
