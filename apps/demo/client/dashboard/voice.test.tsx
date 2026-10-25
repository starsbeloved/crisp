// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alertVoiceItems, useAlertVoice, useMonitoringSound, useVoice, type VoiceItem } from './useVoice.ts';
import type { Alert } from '../../shared/types.ts';

let root: Root | undefined;
const players: { onended: (() => void) | null; onerror: (() => void) | null; pause: ReturnType<typeof vi.fn> }[] = [];
function Harness({ enabled, items }: { enabled: boolean; items: VoiceItem[] }) {
  const voice = useVoice(enabled, items); return <span>{voice.talkingId ?? 'idle'}{voice.error}</span>;
}
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; players.length = 0; vi.unstubAllGlobals(); });
function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Audio', class {
    onended = null; onerror = null; pause = vi.fn();
    constructor() { players.push(this); }
    play() { return Promise.resolve(); }
  });
  root = createRoot(document.createElement('div'));
}
const a: VoiceItem = { key: 'a:1', id: 'a', url: '/audio/a', speech: 'Ama may need a check.' };
const b: VoiceItem = { key: 'b:1', id: 'b', url: '/audio/b', speech: 'Bea may need a check.' };

function alert(id: string, level: Alert['level'] = 'red'): Alert {
  return { id, visitId: id, level, reasons: ['Fall-like movement detected'], facts: { name: 'Ama', queueNo: 3,
    chiefComplaint: null, answers: { reason: '', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' },
    hrBpm: null, baselineHr: null, rrBpm: null, baselineRr: null, hrReason: null, rrReason: null, postureEvents: [{ kind: 'fall', seconds: 0 }], waitedMin: 0 },
    openedAt: 1, updatedAt: 1, status: 'open', acknowledgedAt: null, checkedAt: null, explanation: null, audio: null, replayFrames: 0, cameraId: 'A' };
}

function AlertHarness({ enabled, items }: { enabled: boolean; items: Alert[] }) {
  useAlertVoice(enabled, items);
  return null;
}
describe('voice queue', () => {
  it('does not cut off the current announcement when a new alert arrives', async () => {
    setup();
    await act(() => root!.render(<Harness enabled items={[a]} />));
    await act(() => root!.render(<Harness enabled items={[a, b]} />));
    expect(players[0].pause).not.toHaveBeenCalled();
    await act(() => players[0].onended?.());
    expect(players).toHaveLength(2);
  });
  it('falls back once after a missing audio file and does not replay on an SSE refresh', async () => {
    setup();
    const speak = vi.fn((u: SpeechSynthesisUtterance) => { u.onend?.(new Event('end') as SpeechSynthesisEvent); });
    vi.stubGlobal('SpeechSynthesisUtterance', class { onend = null; onerror = null; constructor(public text: string) {} });
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    await act(() => root!.render(<Harness enabled={false} items={[a]} />));
    expect(players).toHaveLength(0);
    await act(() => root!.render(<Harness enabled items={[a]} />));
    await act(() => players[0].onerror?.());
    await act(() => root!.render(<Harness enabled items={[{ ...a }]} />));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(players).toHaveLength(1);
  });
});

it('drains multiple browser announcements even when speech callbacks finish before React paints', async () => {
  setup();
  const speak = vi.fn((u: SpeechSynthesisUtterance) => u.onend?.(new Event('end') as SpeechSynthesisEvent));
  vi.stubGlobal('SpeechSynthesisUtterance', class { onend = null; onerror = null; constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
  await act(() => root!.render(<Harness enabled={false} items={[{ ...a, url: null }, { ...b, url: null }]} />));
  await act(() => root!.render(<Harness enabled items={[{ ...a, url: null }, { ...b, url: null }]} />));
  expect(speak).toHaveBeenCalledTimes(2);
});

it('advances the queue under browser-style React batching after instant speech completion', async () => {
  setup(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
  const speak = vi.fn((u: SpeechSynthesisUtterance) => queueMicrotask(() => u.onend?.(new Event('end') as SpeechSynthesisEvent)));
  vi.stubGlobal('SpeechSynthesisUtterance', class { onend = null; onerror = null; constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
  try {
    root!.render(<Harness enabled={false} items={[{ ...a, url: null }, { ...b, url: null }]} />);
    await new Promise(resolve => setTimeout(resolve, 30));
    root!.render(<Harness enabled items={[{ ...a, url: null }, { ...b, url: null }]} />);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(speak).toHaveBeenCalledTimes(2);
  } finally { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); }
});

it('speaks a new alert immediately once and speaks a red upgrade once', async () => {
  setup();
  const speak = vi.fn();
  vi.stubGlobal('SpeechSynthesisUtterance', class { onend = null; onerror = null; constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn(), resume: vi.fn() });
  await act(() => root!.render(<AlertHarness enabled items={[alert('fall-1', 'amber')]} />));
  expect(speak).toHaveBeenCalledTimes(1);
  await act(() => root!.render(<AlertHarness enabled items={[{ ...alert('fall-1'), updatedAt: 2 }]} />));
  expect(speak).toHaveBeenCalledTimes(2);
  await act(() => root!.render(<AlertHarness enabled items={[{ ...alert('fall-1'), updatedAt: 3 }]} />));
  expect(speak).toHaveBeenCalledTimes(2);
  await act(() => root!.render(<AlertHarness enabled items={[{ ...alert('fall-1'), updatedAt: 4, audio: 'ready',
    explanation: { bubble: 'Ama may need a check.', speech: 'Provider version.', source: 'gemini' } }]} />));
  expect(speak).toHaveBeenCalledTimes(2);
  expect(players).toHaveLength(0);
});

it('labels replay speech and skips checked requests', () => {
  expect(alertVoiceItems([alert('replay')], ['replay'])[0].speech).toBe('Replay. Fall-like movement detected. Ama, number 3, may need a check.');
  expect(alertVoiceItems([{ ...alert('done'), status: 'checked' }])).toEqual([]);
});

it('remembers the one-click sound choice after the monitoring surface remounts', async () => {
  setup(); sessionStorage.clear();
  const speak = vi.fn();
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { speak, resume: vi.fn() });
  const container = document.createElement('div');
  await act(() => root!.unmount()); root = createRoot(container);
  function Sound() { const sound = useMonitoringSound(); return <button onClick={sound.toggle}>{sound.enabled ? 'on' : 'off'}</button>; }
  await act(() => root!.render(<Sound />));
  expect(container.textContent).toBe('off');
  await act(() => container.querySelector('button')!.click());
  expect(container.textContent).toBe('on');
  expect(speak).toHaveBeenCalledOnce();
  await act(() => root!.render(null));
  await act(() => root!.render(<Sound />));
  expect(container.textContent).toBe('on');
  sessionStorage.clear();
});
