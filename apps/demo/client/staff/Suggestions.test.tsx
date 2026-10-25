// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Suggestions } from './Suggestions.tsx';
let root: Root | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); });
it('proposes first, sends only explicit Yes/Not now and disables stale actions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const accept = vi.fn(), dismiss = vi.fn(); const node = document.createElement('div'); root = createRoot(node);
  const props = { snapshot: { suggestions: [{ id: '1', kind: 'room_free' as const, text: 'Room 1 is free. Call Ama?', createdAt: 0, action: 'call' as const }], dispositions: {} }, ready: true, busy: false, onAccept: accept, onDismiss: dismiss };
  await act(() => root!.render(<Suggestions {...props} />)); expect(accept).not.toHaveBeenCalled();
  await act(() => node.querySelector<HTMLButtonElement>('button')!.click()); expect(accept).toHaveBeenCalledWith('1');
  await act(() => node.querySelectorAll<HTMLButtonElement>('button')[1].click()); expect(dismiss).toHaveBeenCalledWith('1');
  await act(() => root!.render(<Suggestions {...props} ready={false} />)); expect(node.querySelector('button')!.disabled).toBe(true);
});
