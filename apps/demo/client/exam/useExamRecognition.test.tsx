// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useExamRecognition } from './useExamRecognition.ts';
import type { Visit } from '../../shared/types.ts';
const detector = vi.hoisted(() => ({ detectFaces: vi.fn() }));
vi.mock('../lib/face.ts', () => detector);
let root: Root | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('stops media tracks when a station leaves the exam view while camera permission is pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let acquire!: (stream: unknown) => void;
  const stop = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(() => new Promise(resolve => { acquire = resolve; })) } });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
  function Harness() { const ref = useRef<HTMLVideoElement>(null); useExamRecognition(ref, [], '1', true, () => {}); return <video ref={ref} />; }
  root = createRoot(document.createElement('div'));
  await act(() => root!.render(<Harness />));
  await act(() => root!.unmount()); root = undefined;
  await act(async () => { acquire({ getTracks: () => [{ stop }] }); });
  expect(stop).toHaveBeenCalledOnce();
});

it('confirms a called patient across consecutive frames and releases tracks when recognition is disabled', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers();
  const stop = vi.fn(); const track = { stop, onended: null };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] })) } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  const visits: Visit[] = [{ id: 'ama', name: 'Ama', queueNo: 1, status: 'called', calledAt: Date.now(), createdAt: Date.now(), room: '1', faceEnrolled: true, summary: null, answers: { reason: '', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' } }];
  const found = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ visitId: 'ama', name: 'Ama', descriptor: [0, 0] }] })));
  detector.detectFaces.mockResolvedValue([{ box: { x: 0, y: 0, w: 150, h: 180 }, score: 0.95, descriptor: [0, 0], landmarks: [] }]);
  function Harness({ active }: { active: boolean }) { const ref = useRef<HTMLVideoElement>(null); useExamRecognition(ref, visits, '1', active, found); return <video ref={ref} />; }
  root = createRoot(document.createElement('div'));
  await act(() => root!.render(<Harness active />));
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(found).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(found).toHaveBeenCalledExactlyOnceWith('ama');
  await act(() => root!.render(<Harness active={false} />));
  expect(stop).toHaveBeenCalledOnce();
});
