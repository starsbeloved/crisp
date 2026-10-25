// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { RoomState } from '../../shared/types.ts';
import type { PoseSample } from './signals/index.ts';

const model = vi.hoisted(() => ({ now: 0, poses: [] as PoseSample['landmarks'][], frame: null as (() => void) | null,
  detectFaces: vi.fn(), detectForVideo: vi.fn(), observations: vi.fn(), overlay: vi.fn() }));
vi.mock('../lib/camera.ts', () => ({ scheduleVideoFrame: (_video: unknown, callback: () => void) => {
  model.frame = callback; return () => { model.frame = null; };
} }));
vi.mock('../lib/face.ts', () => ({ loadFaceModels: async () => {}, detectFaces: model.detectFaces }));
vi.mock('./pose.ts', () => ({ loadPoseModel: async () => ({ model: { detectForVideo: model.detectForVideo, close: () => {} }, delegate: 'GPU' }) }));
vi.mock('./overlay.ts', () => ({ drawOverlay: model.overlay }));
vi.mock('../lib/api.ts', () => ({ api: { gallery: async () => [{ visitId: 'ama', name: 'Ama', descriptor: [0, 0] }],
  observations: model.observations, frame: async () => {} } }));

import { useVision } from './useVision.ts';

const room = { visits: [{ id: 'ama', status: 'waiting', faceEnrolled: true }], vitals: {}, alerts: [] } as unknown as RoomState;
function pose(shift = 0): PoseSample['landmarks'] {
  const p = Array.from({ length: 33 }, () => ({ x: .3, y: .2 + shift, z: 0, visibility: .9 }));
  p[11] = { ...p[0], x: .22, y: .4 + shift }; p[12] = { ...p[0], x: .38, y: .4 + shift };
  p[23] = { ...p[0], x: .24, y: .7 + shift }; p[24] = { ...p[0], x: .36, y: .7 + shift };
  return p;
}

let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('draws at video cadence, caps face inference, and uploads a drop followed by disappearance immediately', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  model.now = 0; model.poses = [pose()]; model.frame = null;
  model.overlay.mockClear(); model.detectForVideo.mockReset().mockImplementation(() => ({ landmarks: model.poses }));
  model.observations.mockReset().mockResolvedValue({});
  model.detectFaces.mockReset().mockResolvedValue([{ box: { x: 162, y: 70, w: 60, h: 70 }, descriptor: [0, 0], score: .95, landmarks: [] }]);
  vi.spyOn(performance, 'now').mockImplementation(() => model.now);
  vi.spyOn(Date, 'now').mockImplementation(() => 100_000 + model.now);
  const context = { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4), width: 320, height: 240 }) } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob()));
  function Harness() {
    const video = useRef(document.createElement('video')), canvas = useRef(document.createElement('canvas'));
    for (const [name, value] of Object.entries({ videoWidth: 640, videoHeight: 480, readyState: 4 })) {
      Object.defineProperty(video.current, name, { configurable: true, value });
    }
    useVision(video, canvas, { ready: true, cam: 'SYNTHETIC', replayName: 'generated landmarks', state: room, privacy: false, debug: true });
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(() => root!.render(<Harness />));
  async function frame(t: number) { model.now = t; await act(async () => { model.frame?.(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  for (let t = 0; t <= 6000; t += 50) await frame(t);
  expect(model.overlay).toHaveBeenCalledTimes(121);
  expect(model.detectFaces.mock.calls.length).toBeLessThanOrEqual(26); // Includes one model warm-up.
  expect(model.detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(55);
  const current = model.overlay.mock.calls.at(-1)![1][0];
  expect(current.reading.referenceReady).toBe(true);
  expect(current.track.match.visitId).toBe('ama');
  expect(model.overlay.mock.calls.at(-1)![3].modelStatus).toBe('Pose model: ready · GPU');

  model.poses = [pose(.08)]; await frame(6100); await frame(6150);
  model.poses = []; await frame(6200); await frame(6250);
  expect(model.observations.mock.calls.flatMap(call => call[0])).toEqual(expect.arrayContaining([
    expect.objectContaining({ visitId: 'ama', source: 'replay', at: 106250, hrBpm: null, posture: expect.objectContaining({ fallSuspected: true }) }),
  ]));
});
