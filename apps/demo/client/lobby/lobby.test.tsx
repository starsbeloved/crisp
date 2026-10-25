// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LobbyPage } from './LobbyPage.tsx';
import { demoFixture } from '../dashboard/fixture.ts';
const mock = vi.hoisted(() => ({ room: null as any }));
vi.mock('../lib/useRoomState.ts', () => ({ useRoomState: () => ({ state: mock.room, connected: true }) }));
let root: Root | undefined;
const players: any[] = [], spoken: any[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ minutesBetweenCalls: 12, usingFallback: true, waiting: [] }) }));
  vi.stubGlobal('Audio', class { onended: any; onerror: any; volume = 1; pause = vi.fn(); constructor(public url: string) { players.push(this); } play() { return Promise.resolve(); } });
  vi.stubGlobal('SpeechSynthesisUtterance', class { onend: any; onerror: any; constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { resume: vi.fn(), speak: (u: any) => spoken.push(u), cancel: vi.fn() });
});
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; players.length = 0; spoken.length = 0; vi.unstubAllGlobals(); });
it('plays one soft chime before the call-out and does not repeat on a room refresh', async () => {
  mock.room = demoFixture();
  mock.room.nowCalling = { id: 'call-1', visitId: 'ama', name: 'Ama', queueNo: 2, room: 'Room 2', at: Date.now(), audio: 'failed' };
  const container = document.createElement('div'); root = createRoot(container);
  await act(() => root!.render(<LobbyPage />));
  expect(players).toHaveLength(0);
  await act(() => container.querySelector('button')!.click());
  expect(players).toHaveLength(1); expect(players[0].url).toBe('/sounds/lobby-chime.wav');
  expect(spoken.map(u => u.text)).toEqual(['Monitoring sound is on.']);
  await act(() => players[0].onended());
  expect(spoken[1].text).toBe('Ama, number 2, please come to Room 2.');
  mock.room = { ...mock.room }; await act(() => root!.render(<LobbyPage />));
  expect(players).toHaveLength(1); expect(spoken).toHaveLength(2);
});

it('shows and speaks only the first name with a normalized room label', async () => {
  mock.room = demoFixture();
  mock.room.nowCalling = { id: 'call-private', visitId: 'ama', name: 'Ama Private', queueNo: 2, room: 'room two', at: Date.now(), audio: 'ready' };
  const container = document.createElement('div'); root = createRoot(container);
  await act(() => root!.render(<LobbyPage />));
  expect(container.querySelector('.lobby-called-person')!.textContent).toBe('Ama#2');
  expect(container.textContent).not.toContain('Private'); expect(container.textContent).not.toContain('Chest feels tight');
  expect(container.textContent).toContain('Ama, number 2, please come to Room 2.');
  await act(() => container.querySelector('button')!.click());
  await act(() => players[0].onended());
  expect(players[1].url).toBe('/api/calls/call-private/audio');
});
