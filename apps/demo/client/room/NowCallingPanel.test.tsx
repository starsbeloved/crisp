// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NowCalling } from '../../shared/types.ts';
import { NowCallingPanel } from './NowCallingPanel.tsx';

let root: Root;
let container: HTMLDivElement;
const players: { url: string; onended: (() => void) | null; onerror: (() => void) | null; pause: ReturnType<typeof vi.fn> }[] = [];
const spoken: SpeechSynthesisUtterance[] = [];
const call: NowCalling = { id: 'call-1', visitId: 'ama', name: 'Ama Example', queueNo: 2, room: 'Room 1', at: 1000, audio: 'pending' };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Audio', class {
    onended = null; onerror = null; pause = vi.fn();
    constructor(public url: string) { players.push(this); }
    play() { return Promise.resolve(); }
  });
  vi.stubGlobal('SpeechSynthesisUtterance', class { onend = null; onerror = null; constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { speak: (utterance: SpeechSynthesisUtterance) => spoken.push(utterance), cancel: vi.fn() });
  container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  players.length = 0; spoken.length = 0; vi.unstubAllGlobals();
});
async function render(value: NowCalling | null, connected = true) {
  await act(() => root.render(<NowCallingPanel call={value} connected={connected} />));
}
async function toggleSound() { await act(() => container.querySelector('button')!.click()); }

it('shows a public call-out with only the first name, queue number and room', async () => {
  await render(call);
  expect(container.querySelector('h2')?.textContent).toBe('Now calling');
  expect(container.textContent).toContain('Ama');
  expect(container.textContent).toContain('#2');
  expect(container.textContent).toContain('Room 1');
  expect(container.textContent).not.toContain('Example');
  expect(players).toHaveLength(0);
});

it('waits for ready audio, speaks once and does not repeat after SSE refreshes or sound toggles', async () => {
  await render(call); await toggleSound();
  expect(players).toHaveLength(0);
  await render({ ...call, audio: 'ready' });
  expect(players.map(player => player.url)).toEqual(['/api/calls/call-1/audio']);
  expect(container.querySelector('.crisp-character')?.getAttribute('data-state')).toBe('talking');
  await render({ ...call, audio: 'ready' });
  expect(players).toHaveLength(1);
  await act(() => players[0].onended?.());
  await toggleSound(); await toggleSound();
  expect(players).toHaveLength(1);
  expect(container.querySelector('.crisp-character')?.getAttribute('data-state')).toBe('pointing');
});

it('falls back to the browser once on an ElevenLabs playback failure', async () => {
  await render({ ...call, audio: 'ready' }); await toggleSound();
  await act(() => players[0].onerror?.());
  expect(spoken.map(utterance => utterance.text)).toEqual(['Ama, number 2, please come to Room 1.']);
  await act(() => spoken[0].onend?.(new Event('end') as SpeechSynthesisEvent));
  await render({ ...call, audio: 'ready' });
  expect(spoken).toHaveLength(1);
});

it('uses browser voice for failed generation and announces a subsequent call', async () => {
  await render({ ...call, audio: 'failed' }); await toggleSound();
  expect(spoken.map(utterance => utterance.text)).toEqual(['Ama, number 2, please come to Room 1.']);
  await act(() => spoken[0].onend?.(new Event('end') as SpeechSynthesisEvent));
  await render({ ...call, id: 'call-2', name: 'Ben Example', queueNo: 3, room: 'Room 2', audio: 'failed' });
  expect(spoken.map(utterance => utterance.text)).toEqual(['Ama, number 2, please come to Room 1.', 'Ben, number 3, please come to Room 2.']);
});

it('shows an idle welcome and an honest connection message', async () => {
  await render(null, false);
  expect(container.textContent).toContain('Please take a seat');
  expect(container.textContent).toContain('Reconnecting');
  expect(players).toHaveLength(0);
});

it('stops playback when the room screen unmounts', async () => {
  await render({ ...call, audio: 'ready' }); await toggleSound();
  await act(() => root.render(null));
  expect(players[0].pause).toHaveBeenCalledOnce();
});
