// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useDoctorVoice } from './useDoctorVoice.ts';
let root: Root | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); });
it('releases the mic and resumes correctly after disabling voice during speech', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const listeners: { start: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('webkitSpeechRecognition', class { start = vi.fn(); abort = vi.fn(); constructor() { listeners.push(this); } });
  vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  let voice!: ReturnType<typeof useDoctorVoice>;
  function Harness({ enabled }: { enabled: boolean }) { voice = useDoctorVoice(enabled, () => {}); return null; }
  root = createRoot(document.createElement('div'));
  await act(() => root!.render(<Harness enabled />));
  await act(() => voice.speak('This is Ama. Their chart is on screen.'));
  await act(() => root!.render(<Harness enabled={false} />));
  expect(listeners[0].abort).toHaveBeenCalled();
  await act(() => root!.render(<Harness enabled />));
  expect(listeners[1].start).toHaveBeenCalledOnce();
});
