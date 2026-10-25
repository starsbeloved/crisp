// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { CameraStatus } from '../../shared/types.ts';
import { demoFixture } from './fixture.ts';
import { SystemStrip } from './SystemStrip.tsx';
import { CallInPopover } from './CallInPopover.tsx';

it.each([
  [false, [], 'Reconnecting to room'],
  [true, [], 'No active camera'],
  [true, [{ cameraId: 'A', lastFrameAt: 9999, source: 'live', fps: 15, visible: false }], 'Camera paused'],
  [true, [{ cameraId: 'A', lastFrameAt: 7000, source: 'live', fps: 15, visible: true }], 'Camera feed stale'],
  [true, [{ cameraId: 'A', lastFrameAt: 9999, source: 'live', fps: 15, visible: true }], 'Live camera connected'],
  [true, [{ cameraId: 'A', lastFrameAt: 9999, source: 'replay', fps: 15, visible: true }], 'Replay camera connected'],
] as [boolean, CameraStatus[], string][])('describes monitoring availability: %s %j', (connected, cameras, label) => {
  const state = demoFixture(10_000);
  state.cameras = Object.fromEntries(cameras.map(camera => [camera.cameraId, camera]));
  const html = renderToStaticMarkup(<SystemStrip state={state} connected={connected} now={10_000} voice={false} talking={false} geminiVision={false} busy={false} onVoice={() => {}} onTestSound={() => {}} onGeminiVision={() => {}} onReset={() => {}} />);
  const node = document.createElement('div'); node.innerHTML = html;
  expect(node.querySelector('.system-summary')?.textContent).toBe(label);
});

it('dismisses room choices with Escape and restores focus without calling anyone', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), onCall = vi.fn();
  try {
    await act(() => root.render(<CallInPopover onCall={onCall} busy={false} />));
    const trigger = host.querySelector('button')!;
    await act(() => trigger.click());
    host.querySelector<HTMLButtonElement>('.room-picker button')!.focus();
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(host.querySelector('.room-picker')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onCall).not.toHaveBeenCalled();
  } finally { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
