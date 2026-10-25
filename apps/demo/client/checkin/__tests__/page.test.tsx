// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CheckInPage } from '../CheckInPage.tsx';
vi.mock('../../lib/face.ts', () => ({ loadFaceModels: vi.fn().mockResolvedValue(undefined), detectFaces: vi.fn().mockResolvedValue([]) }));
it('starts with an empty preferred name and keeps help and Back available', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('EventSource', class extends EventTarget { close() {} });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CheckInPage />));
    function button(text: string) { return [...container.querySelectorAll('button')].find(button => button.textContent === text); }
    expect(button('Start')).toBeUndefined();
    expect(button('Talk to Crisp')).toBeDefined(); expect(button('I’d rather tap')).toBeDefined();
    expect(button('Back')).toBeDefined(); expect(button('I need help')).toBeDefined();
    expect(container.querySelectorAll('svg.crisp-character')).toHaveLength(1);
    await act(async () => button('I’d rather tap')!.click());
    expect(container.querySelector('input')?.value).toBe('');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    await act(async () => button('I need help')!.click());
    expect(container.textContent).toContain('ask a staff member');
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
