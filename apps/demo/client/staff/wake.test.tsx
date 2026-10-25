// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { wakeCommand, useWakeWord } from './useWakeWord.ts';
let root: Root | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });
it('recognizes only the wake phrase and preserves the staff request', () => {
  for (const name of ['Crisp', 'Chris', 'Crispy']) expect(wakeCommand(`Hey ${name}, call Ama to Room 1.`)).toBe('call Ama to Room 1.');
  expect(wakeCommand('Hey Crisp')).toBe(''); expect(wakeCommand('I like crisps')).toBe(null);
});
it('is off by default, uses continuous en-US, yields mic once on wake and releases on unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const instances: any[] = [];
  class Recognition { lang = ''; continuous = false; interimResults = false; onresult: any; onend: any; onerror: any; onstart: any; start = vi.fn(() => this.onstart?.()); abort = vi.fn(); constructor() { instances.push(this); } }
  vi.stubGlobal('webkitSpeechRecognition', Recognition);
  const wake = vi.fn(); let enabled = false;
  function Harness() { const value = useWakeWord(enabled, wake); return <p>{value.status}</p>; }
  root = createRoot(document.createElement('div'));
  await act(() => root!.render(<Harness />)); expect(instances).toHaveLength(0);
  enabled = true; await act(() => root!.render(<Harness />));
  expect(instances[0]).toMatchObject({ lang: 'en-US', continuous: true });
  const event = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Hey Chris, call Ama to Room 1' } }] };
  await act(() => { instances[0].onresult(event); instances[0].onresult(event); });
  expect(wake).toHaveBeenCalledExactlyOnceWith('call Ama to Room 1');
  expect(instances[0].abort).toHaveBeenCalled();
  await act(() => root!.unmount()); root = undefined;
  expect(instances[0].onresult).toBe(null);
});
it('stops retrying after mic permission denial', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); let instance: any;
  class Recognition { onresult: any; onend: any; onerror: any; onstart: any; start = vi.fn(); abort = vi.fn(); constructor() { instance = this; } }
  vi.stubGlobal('webkitSpeechRecognition', Recognition);
  function Harness() { const value = useWakeWord(true, vi.fn()); return <p>{value.status}</p>; }
  const node = document.createElement('div'); root = createRoot(node);
  await act(() => root!.render(<Harness />));
  await act(() => { instance.onerror({ error: 'not-allowed' }); instance.onend(); vi.advanceTimersByTime(1000); });
  expect(instance.start).toHaveBeenCalledTimes(1); expect(node.textContent).toContain('not-allowed');
});
it('shows the last heard phrase and restarts after Chrome ends recognition', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); let instance: any;
  class Recognition { onresult: any; onend: any; onerror: any; onstart: any; start = vi.fn(() => this.onstart?.()); abort = vi.fn(); constructor() { instance = this; } }
  vi.stubGlobal('webkitSpeechRecognition', Recognition);
  function Harness() { const value = useWakeWord(true, vi.fn()); return <p>{value.status} · {value.lastHeard} · {value.listening ? 'live' : 'off'}</p>; }
  const node = document.createElement('div'); root = createRoot(node);
  await act(() => root!.render(<Harness />));
  await act(() => instance.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'What is happening in the room' } }] }));
  expect(node.textContent).toContain('What is happening in the room');
  expect(node.textContent).toContain('live');
  await act(() => { instance.onend(); vi.advanceTimersByTime(400); });
  expect(instance.start).toHaveBeenCalledTimes(2);
});
