// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LobbyPage } from './LobbyPage.tsx';
import { demoFixture } from '../dashboard/fixture.ts';
const mock = vi.hoisted(() => ({ room: null as any, enabled: false, items: [] as { url: string | null; speech: string }[] }));
vi.mock('../lib/useRoomState.ts', () => ({ useRoomState: () => ({ state: mock.room, connected: true }) }));
vi.mock('../dashboard/useVoice.ts', () => ({ useVoice: (enabled: boolean, items: typeof mock.items) => { mock.enabled = enabled; mock.items = items; return { talkingId: null, error: '' }; } }));
let root: Root | undefined;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ minutesBetweenCalls: 12, usingFallback: true, waiting: [] }) }));
});
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); });
it('plays one soft chime before enabling the call-out and does not repeat on a room refresh', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let chime: any;
  const play = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('Audio', class { onended: any; onerror: any; volume = 1; pause = vi.fn(); play = play; constructor() { chime = this; } });
  mock.room = demoFixture();
  mock.room.nowCalling = { id: 'call-1', visitId: 'ama', name: 'Ama', queueNo: 2, room: 'Room 2', at: Date.now(), audio: 'failed' };
  const container = document.createElement('div'); root = createRoot(container);
  await act(() => root!.render(<LobbyPage />));
  expect(play).not.toHaveBeenCalled();
  await act(() => container.querySelector('button')!.click());
  expect(play).toHaveBeenCalledTimes(1); expect(mock.enabled).toBe(false);
  await act(() => chime.onended());
  expect(mock.enabled).toBe(true);
  mock.room = { ...mock.room }; await act(() => root!.render(<LobbyPage />));
  expect(play).toHaveBeenCalledTimes(1);
});

it('shows and speaks only the first name of the called patient', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mock.room = demoFixture();
  mock.room.nowCalling = { id: 'call-private', visitId: 'ama', name: 'Ama Private', queueNo: 2, room: 'Room 2', at: Date.now(), audio: 'ready' };
  const container = document.createElement('div'); root = createRoot(container);
  await act(() => root!.render(<LobbyPage />));
  expect(container.querySelector('.lobby-called-person')!.textContent).toBe('Ama#2');
  expect(container.textContent).not.toContain('Private');
  expect(container.textContent).not.toContain('Chest feels tight');
  expect(mock.items).toEqual([{ key: 'call-private', id: 'call-private', url: '/api/calls/call-private/audio', speech: 'Ama, number 2, please come to Room 2.' }]);
});
