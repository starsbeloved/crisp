// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useStaffSession } from './useStaffSession.ts';
let root: Root | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers();
  const end = vi.fn();
  const state = { connected: true, captions: [] as { speaker: string; text: string }[], speaking: false, busy: false, completed: 0, getInputVolume: () => 0 };
  function Harness() { useStaffSession(state, end); return null; }
  root = createRoot(document.createElement('div'));
  const render = () => act(() => root!.render(<Harness />));
  await render(); return { state, end, render };
}
it('ends after eight seconds following command completion, giving speech and pending tools time to finish', async () => {
  const { state, end, render } = await setup();
  await act(() => vi.advanceTimersByTime(9000)); expect(end).not.toHaveBeenCalled();
  state.completed++; state.speaking = true; await render();
  await act(() => vi.advanceTimersByTime(9000)); expect(end).not.toHaveBeenCalled();
  state.speaking = false; await render();
  await act(() => vi.advanceTimersByTime(7999)); expect(end).not.toHaveBeenCalled();
  state.busy = true; await render(); await act(() => vi.advanceTimersByTime(9000)); expect(end).not.toHaveBeenCalled();
  state.busy = false; await render();
  await act(() => vi.advanceTimersByTime(8000)); expect(end).toHaveBeenCalledTimes(1);
});
it.each(['No.', "that's all", 'Thanks!', 'stop', 'No thanks', 'That’s all, thanks.'])('ends when staff says %s', async text => {
  const { state, end, render } = await setup();
  state.captions = [{ speaker: 'You', text }]; await render(); expect(end).toHaveBeenCalledTimes(1);
});
it('resets silence on a follow-up and never treats an agent confirmation or a negative command as session end', async () => {
  const { state, end, render } = await setup();
  state.completed++; await render(); await act(() => vi.advanceTimersByTime(7000));
  state.captions = [{ speaker: 'Crisp', text: 'No.' }, { speaker: 'You', text: 'No allergies for Anna?' }]; await render();
  await act(() => vi.advanceTimersByTime(7000)); expect(end).not.toHaveBeenCalled();
  state.connected = false; await render(); await act(() => vi.advanceTimersByTime(9000)); expect(end).not.toHaveBeenCalled();
});
it('also times out after an Anything else prompt when no staff action tool ran', async () => {
  const { state, end, render } = await setup();
  state.captions = [{ speaker: 'Crisp', text: 'Anything else?' }]; await render();
  await act(() => vi.advanceTimersByTime(8000)); expect(end).toHaveBeenCalledTimes(1);
});

it('counts silence after microphone activity stops, not while a long follow-up is being spoken', async () => {
  const { state, end, render } = await setup();
  let volume = 0.1; state.getInputVolume = () => volume;
  state.completed++; await render();
  await act(() => vi.advanceTimersByTime(9000)); expect(end).not.toHaveBeenCalled();
  volume = 0;
  await act(() => vi.advanceTimersByTime(7999)); expect(end).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTime(1)); expect(end).toHaveBeenCalledTimes(1);
});
