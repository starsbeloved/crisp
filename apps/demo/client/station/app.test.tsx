// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
vi.mock('../checkin/CheckInPage.tsx', () => ({ CheckInPage: () => <p>Kiosk page</p> }));
vi.mock('../camera/CameraPage.tsx', () => ({ CameraPage: () => <p>Camera page</p> }));
vi.mock('../dashboard/DashboardPage.tsx', () => ({ DashboardPage: () => <div className="system-popover">Dashboard page</div> }));
vi.mock('../lobby/LobbyPage.tsx', () => ({ LobbyPage: () => <p>Lobby page</p> }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it('routes /station to a full-screen picker without the demo navigation', async () => {
  history.replaceState(null, '', '/station'); await act(async () => root.render(<App />));
  expect(container.querySelector('h1')?.textContent).toBe('What is this screen?');
  expect(container.querySelector('nav')).toBeNull();
});

it.each([
  ['/check-in', 'Kiosk page'], ['/camera', 'Camera page'], ['/dashboard', 'Dashboard page'], ['/lobby', 'Lobby page'],
])('keeps the existing %s page inside the station shell', async (url, content) => {
  history.replaceState(null, '', url); await act(async () => root.render(<App />));
  expect(container.textContent).toContain(content);
  expect(container.querySelector('[aria-label="Switch station role"]')).not.toBeNull();
});

it.each(['/room', '/exam?room=2'])('recognizes %s even before its parallel packet is merged', async url => {
  history.replaceState(null, '', url); await act(async () => root.render(<App />));
  expect(container.textContent).not.toContain('No one waits unseen.');
  expect(container.querySelector('[aria-label="Switch station role"]')).not.toBeNull();
});
