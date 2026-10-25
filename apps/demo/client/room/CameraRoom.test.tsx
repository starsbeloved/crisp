// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CameraPage } from '../camera/CameraPage.tsx';

vi.mock('../lib/useRoomState.ts', () => ({ useRoomState: () => ({ state: null, connected: false }) }));
vi.mock('../camera/useCameraSource.ts', () => ({ useCameraSource: () => ({ ready: false, message: 'Camera unavailable', devices: [] }) }));
vi.mock('../camera/useVision.ts', () => ({ useVision: () => ({ models: 'Loading face models…', poseStatus: 'Pose model: loading', error: '', stats: { count: 0, fps: 0 }, tracker: { current: { current: () => [] } } }) }));

it('opens one local camera with overlays inside /room and retains the standalone camera page', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'), root = createRoot(container);
  try {
    await act(() => root.render(<CameraPage roomView />));
    expect(container.querySelector('.room-camera video')).not.toBeNull();
    expect(container.querySelector('.room-camera canvas[aria-label="Face detection overlay"]')).not.toBeNull();
    expect(container.textContent).toContain('Camera unavailable');
    expect(container.textContent).toContain('camera estimates');
    expect(container.textContent).not.toContain('Cam B');
    expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent === 'Demo view')).toBe(false);
    const settings = container.querySelector<HTMLButtonElement>('[aria-label="Camera settings"]')!;
    await act(() => settings.click());
    expect(settings.getAttribute('aria-expanded')).toBe('true');
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    await act(() => root.render(<CameraPage />));
    expect(container.querySelector('.room-view')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent === 'Demo view')).toBe(true);
  } finally { await act(() => root.unmount()); vi.unstubAllGlobals(); }
});

it('keeps every debug field visible when no face or body is detected and settings are closed', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  history.replaceState(null, '', '/room?debug=1');
  const container = document.createElement('div'), root = createRoot(container);
  try {
    await act(() => root.render(<CameraPage roomView />));
    const debug = container.querySelector('[aria-label="Camera debug readings"]');
    expect(debug).not.toBeNull();
    expect(debug?.closest('[hidden]')).toBeNull();
    for (const field of ['track', 'visit', 'source', 'referenceReady', 'slumpSec', 'headDropSec', 'fallSuspected', 'velocity', 'fps', 'Pose model: loading']) {
      expect(debug?.textContent).toContain(field);
    }
  } finally { await act(() => root.unmount()); history.replaceState(null, '', '/'); vi.unstubAllGlobals(); }
});

it('never labels an unavailable camera LIVE and dismisses standalone settings with Escape', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(<CameraPage />));
    expect(container.querySelector('.camera-view-actions .chip')?.textContent).not.toBe('LIVE');
    const settings = container.querySelector<HTMLButtonElement>('[aria-label="Camera settings"]')!;
    await act(() => settings.click());
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(settings);
  } finally { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
