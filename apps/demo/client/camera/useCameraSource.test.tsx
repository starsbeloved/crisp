// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const camera = vi.hoisted(() => ({ open: vi.fn(), stop: vi.fn() }));
vi.mock('../lib/camera.ts', () => ({ openCamera: camera.open, listCameras: async () => [] }));
import { useCameraSource } from './useCameraSource.ts';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('stops the camera on pagehide, reopens on pageshow, and stops again on unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  camera.stop.mockClear();
  const track = { stop: camera.stop, onended: null, applyConstraints: async () => {}, getSettings: () => ({}) };
  camera.open.mockReset().mockResolvedValue({ getTracks: () => [track], getVideoTracks: () => [track] });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  let source: ReturnType<typeof useCameraSource>;
  function Harness() {
    const video = useRef(document.createElement('video'));
    source = useCameraSource(video, 'TEST', null, '');
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => { root.render(<Harness />); });
    expect(source!.ready).toBe(true);
    await act(() => window.dispatchEvent(new Event('pagehide')));
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(source!.ready).toBe(false);
    await act(() => window.dispatchEvent(new Event('pageshow')));
    expect(source!.ready).toBe(true);
    expect(camera.open).toHaveBeenCalledTimes(2);
  } finally { await act(() => root.unmount()); }
  expect(camera.stop).toHaveBeenCalledTimes(2);
});

it('stops a late camera acquisition after the page has already hidden', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let acquired!: (stream: unknown) => void;
  const stop = vi.fn();
  camera.open.mockReset().mockImplementation(() => new Promise(resolve => { acquired = resolve; }));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  function Harness() {
    const video = useRef(document.createElement('video'));
    useCameraSource(video, 'LATE', null, ''); return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(() => root.render(<Harness />));
    await act(() => window.dispatchEvent(new Event('pagehide')));
    await act(() => acquired({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalledTimes(1);
  } finally { await act(() => root.unmount()); }
});
