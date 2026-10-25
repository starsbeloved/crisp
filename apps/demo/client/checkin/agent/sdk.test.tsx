// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AskCrispVoice } from '../../dashboard/AskCrispVoice.tsx';

vi.mock('../../lib/useRoomState.ts', () => ({ useRoomState: () => ({ connected: true, state: { providers: { agent: false } } }) }));

it('real SDK nurse widget can lose focus before any voice session without throwing', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const errors: string[] = [];
  const onError = (event: ErrorEvent) => { errors.push(event.message); event.preventDefault(); };
  window.addEventListener('error', onError);
  try {
    await act(async () => root.render(<AskCrispVoice />));
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    expect(errors).toEqual([]);
  } finally {
    await act(async () => root.unmount()); container.remove(); window.removeEventListener('error', onError);
  }
});
