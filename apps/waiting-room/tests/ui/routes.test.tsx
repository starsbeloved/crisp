// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../../client/App.tsx';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('opens a real station launcher without synthetic patient evidence or automatic camera access',()=>{
  const camera=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:camera}});
  render(<App pathname="/"/>);
  expect(screen.getByRole('link',{name:/Patient check-in/}).getAttribute('href')).toBe('/check-in');
  expect(screen.getByRole('link',{name:/Room vision/}).getAttribute('href')).toBe('/vision');
  expect(screen.getByRole('link',{name:/Nurse dashboard/}).getAttribute('href')).toBe('/staff');
  expect(screen.queryByText('Patient 014')).toBeNull();
  expect(camera).not.toHaveBeenCalled();
});
it('mounts the vision station with an explicit connection gate and no automatic acquisition',()=>{
  const camera=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:camera}});
  render(<App pathname="/vision"/>);
  expect(screen.getByRole('button',{name:'Connect vision station'})).toBeTruthy();
  expect(camera).not.toHaveBeenCalled();
});
