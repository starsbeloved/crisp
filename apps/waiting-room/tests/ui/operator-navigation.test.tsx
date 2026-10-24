// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../client/App.tsx';
afterEach(()=>{cleanup();window.history.replaceState(null,'','/');vi.unstubAllGlobals();});
it('uses local operator navigation and browser history without replacing the document',async()=>{
  window.history.replaceState(null,'','/');
  render(<App/>);
  fireEvent.click(screen.getByRole('link',{name:/03 · Nurse dashboard/}));
  expect(await screen.findByRole('button',{name:'Open local staff view'})).toBeTruthy();
  expect(window.location.pathname).toBe('/staff');
  expect(document.activeElement).toBe(screen.getByRole('heading',{level:1}));
  fireEvent.click(screen.getByRole('link',{name:'Vision'}));
  expect(await screen.findByRole('button',{name:'Connect vision station'})).toBeTruthy();
  expect(window.location.pathname).toBe('/vision');
  expect(document.activeElement).toBe(screen.getByRole('heading',{level:1}));
  window.history.replaceState(null,'','/staff');
  fireEvent(window,new PopStateEvent('popstate'));
  expect(await screen.findByRole('button',{name:'Open local staff view'})).toBeTruthy();
});
