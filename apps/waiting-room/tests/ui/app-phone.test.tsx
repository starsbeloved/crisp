// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../client/App.tsx';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('mounts the real phone flow under StrictMode and pairs through the shared API without requesting camera access',async()=>{
  vi.stubGlobal('fetch',async()=>Response.json({visitId:'visit_1',purpose:'ppg'}));
  render(<StrictMode><App pathname="/phone"/></StrictMode>);
  fireEvent.change(await screen.findByRole('textbox',{name:'Eight-digit pairing code'}),{target:{value:'12345678'}});
  fireEvent.click(screen.getByRole('button',{name:'Pair phone'}));
  expect(await screen.findByText('visit_1')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Start camera capture'}).hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Local rear-camera preview').getAttribute('src')).toBeNull();
});
