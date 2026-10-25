// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoPanel } from './VideoPanel.tsx';

vi.mock('../lib/api.ts', () => ({
  api: {
    config: vi.fn(async () => ({ apiPort: 8787, webPort: 5173 })),
    streamUrl: (camera: string) => `/api/stream.mjpg?cam=${encodeURIComponent(camera)}`,
  },
}));

const camera = { cameraId: 'A', lastFrameAt: 1_000, source: 'live' as const, visible: true, fps: 5 };
let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(() => root!.unmount());
  container.remove();
  root = undefined;
  vi.useRealTimers();
});

it('starts the dashboard camera on the same-origin proxy stream', async () => {
  await act(async () => { root!.render(<VideoPanel cameras={{ A: camera }} now={1_000} />); });
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/stream.mjpg?cam=A');
});

it('reconnects the camera image after the stream reports an error', async () => {
  await act(async () => { root!.render(<VideoPanel cameras={{ A: camera }} now={1_000} />); });
  const first = container.querySelector('img');
  await act(() => { first!.dispatchEvent(new Event('error')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(container.querySelector('img')).not.toBe(first);
});
