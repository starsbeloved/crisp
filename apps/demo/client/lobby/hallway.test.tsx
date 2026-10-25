// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NowCalling } from '../../shared/types.ts';
import { NowCallingPanel } from '../room/NowCallingPanel.tsx';
vi.mock('../staff/HallwayCheckBack.tsx', () => ({ HallwayCheckBack: () => null }));
let root: Root, container: HTMLDivElement;
const players: any[] = [], spoken: any[] = [];
let hung = false;
const call: NowCalling = { id: 'call-anna', visitId: 'anna', name: 'Anna Lopez', queueNo: 1, room: 'room one', at: 1, audio: 'pending' };
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Audio', class { onended: any; onerror: any; pause = vi.fn(); constructor(public url: string) { players.push(this); } play() { return hung ? new Promise(() => {}) : Promise.resolve(); } });
  vi.stubGlobal('SpeechSynthesisUtterance', class { onend: any; onerror: any; constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { speak: (u: any) => spoken.push(u), cancel: vi.fn() });
  container = document.createElement('div'); root = createRoot(container); hung = false;
});
afterEach(async () => { await act(() => root.unmount()); players.length = 0; spoken.length = 0; vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = (value = call, sound = true) => act(() => root.render(<NowCallingPanel call={value} connected soundEnabled={sound} />));
it('uses the Room sound unlock and speaks a normalized call by two seconds if generation stalls', async () => {
  await render(call, false); await act(() => vi.advanceTimersByTimeAsync(3000)); expect(spoken).toHaveLength(0);
  await render();
  expect(container.textContent).toContain('Anna, number 1, please come to Room 1.');
  expect(container.textContent).not.toContain('Lopez');
  expect(container.querySelector('button')).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1999)); expect(spoken).toHaveLength(0);
  await act(() => vi.advanceTimersByTimeAsync(1)); expect(spoken[0].text).toBe('Anna, number 1, please come to Room 1.');
  await render({ ...call, audio: 'ready' }); await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(spoken).toHaveLength(1); expect(players).toHaveLength(0);
});
it('prefers provider audio that is ready inside the deadline, with no duplicate fallback', async () => {
  await render(); await act(() => vi.advanceTimersByTimeAsync(1000));
  await render({ ...call, audio: 'ready' });
  expect(players[0].url).toBe('/api/calls/call-anna/audio');
  await act(() => vi.advanceTimersByTimeAsync(3000)); expect(spoken).toHaveLength(0);
  await act(() => players[0].onended());
  await render({ ...call, audio: 'ready' }); expect(players).toHaveLength(1);
});
it('falls back by two seconds when the media play promise hangs', async () => {
  hung = true; await render({ ...call, audio: 'ready' });
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(spoken).toHaveLength(1); expect(players[0].pause).toHaveBeenCalled();
});
it('cancels a pending deadline on unmount', async () => {
  await render(); await act(() => root.render(null));
  await act(() => vi.advanceTimersByTimeAsync(3000)); expect(spoken).toHaveLength(0);
});
