// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useKioskPulse } from '../useKioskPulse.ts';
import { detectFaces } from '../../lib/face.ts';
import type { KioskPulseView } from '../pulse.ts';
const face = { box: { x: 100, y: 50, w: 200, h: 250 }, score: .95, descriptor: [0], landmarks: Array(68).fill({ x: 120, y: 100 }) };
vi.mock('../../lib/face.ts', () => ({ detectFaces: vi.fn(), faceDistance: (a: number[], b: number[]) => Math.abs(a[0] - b[0]) }));
vi.mock('../../camera/sampling.ts', () => ({ meanCheekSample: (_pixels: unknown, _face: unknown, _w: number, _h: number, t: number) => {
  const wave = Math.sin(2 * Math.PI * 1.2 * t / 1000);
  return { t, rgb: [120 + .3 * wave, 100 + 1.5 * wave, 80 + .1 * wave], brightness: 104, faceWidthPx: 200 };
} }));
let view: KioskPulseView | null, cameraReady = true;
const descriptor = [0], video = document.createElement('video'), videoRef = { current: video }, complete = vi.fn();
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
function Harness() { view = useKioskPulse(videoRef, true, cameraReady, descriptor, complete); return null; }
beforeEach(async () => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  cameraReady = true; view = null; complete.mockReset();
  vi.mocked(detectFaces).mockReset().mockResolvedValue([face]);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {}, getImageData() { return {}; } } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  Object.defineProperties(video, { readyState: { value: 4, configurable: true }, videoWidth: { value: 640, configurable: true }, videoHeight: { value: 480, configurable: true }, currentTime: { get: () => performance.now() / 1000, configurable: true } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('samples new video frames, produces a camera reading and auto-completes by 17 s', async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
  expect(view!.reading.hrBpm).toBeCloseTo(72, 0);
  expect(view!.fps).toBeGreaterThan(10);
  expect(complete).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(complete).toHaveBeenCalledOnce();
  expect(complete.mock.calls[0][0].length).toBeGreaterThan(3);
  expect(complete.mock.calls[0][1]).toBe('complete');
});
it('withholds the current number on face loss and on a different face', async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
  expect(view!.reading.hrBpm).not.toBeNull();
  vi.mocked(detectFaces).mockResolvedValue([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(view!.reading.hrBpm).toBeNull();
  vi.mocked(detectFaces).mockResolvedValue([{ ...face, descriptor: [1] }]);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(view!.reading.hrBpm).toBeNull();
});
it('keeps the 25 s deadline when camera readiness changes and prevents overlapping detection', async () => {
  vi.mocked(detectFaces).mockImplementation(() => new Promise(() => {}));
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(detectFaces).toHaveBeenCalledOnce();
  cameraReady = false;
  await act(async () => root.render(<Harness />));
  await act(async () => { await vi.advanceTimersByTimeAsync(15_050); });
  expect(complete).toHaveBeenCalledWith([], 'timeout');
  expect(view!.reading.hrBpm).toBeNull();
});
