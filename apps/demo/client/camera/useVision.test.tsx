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
  const fallReport = model.observations.mock.calls.find(call => call[0].some((observation: { posture: { fallSuspected: boolean } | null }) => observation.posture?.fallSuspected))![0];
  expect(fallReport.filter((observation: { visitId: string | null }) => observation.visitId === 'ama')).toHaveLength(1);
});

it.each(['drop', 'disappear'])('reports face-only %s immediately with the recognized visit and unavailable vitals', async kind => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  model.now = 0; model.poses = []; model.overlay.mockClear();
  model.detectForVideo.mockReset().mockReturnValue({ landmarks: [] });
  model.observations.mockReset().mockResolvedValue({});
  model.detectFaces.mockReset().mockImplementation(async () => model.now >= 1250 && kind === 'disappear' ? [] : [{
    box: { x: 162, y: model.now >= 1000 ? kind === 'drop' ? 190 : 130 : 70, w: 60, h: 70 },
    descriptor: [0, 0], score: .95, landmarks: [],
  }]);
  vi.spyOn(performance, 'now').mockImplementation(() => model.now);
  vi.spyOn(Date, 'now').mockImplementation(() => 100_000 + model.now);
  const context = { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4), width: 320, height: 240 }) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob()));
  function Harness() {
    const video = useRef(document.createElement('video')), canvas = useRef(document.createElement('canvas'));
    for (const [name, value] of Object.entries({ videoWidth: 640, videoHeight: 480, readyState: 4 })) {
      Object.defineProperty(video.current, name, { configurable: true, value });
    }
    useVision(video, canvas, { ready: true, cam: 'FACE-REPLAY', replayName: 'generated boxes', state: room, privacy: false, debug: true });
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(() => root!.render(<Harness />));
  for (let t = 0; t <= 1600; t += 50) {
    model.now = t; await act(async () => { model.frame?.(); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  const fall = model.observations.mock.calls.flatMap(call => call[0]).find(o => o.posture?.fallSuspected);
  expect(fall).toMatchObject({ visitId: 'ama', hrBpm: null, rrBpm: null, source: 'replay' });
  expect(fall.at).toBeLessThan(101600);
  expect(model.overlay.mock.calls.at(-1)![1][0].reading.fallTrigger).toBe(kind === 'drop' ? 'face-drop' : 'face-disappeared');
  expect(model.detectFaces.mock.calls.slice(1).every(([, input]) => input === 640)).toBe(true);
});

it('attaches detector-pixel faces to normalized upper-body poses from 1280x720 video and reports posture', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  model.now = 0; model.overlay.mockClear();
  const upper = pose();
  upper[23] = { x: .24, y: 1.25, z: 0, visibility: .05 };
  upper[24] = { x: .36, y: 1.25, z: 0, visibility: .05 };
  model.detectForVideo.mockReset().mockImplementation(() => ({ landmarks: [upper] }));
  model.observations.mockReset().mockResolvedValue({});
  // Detection returns pixels of its actual input canvas, NOT the TinyFaceDetector inputSize.
  model.detectFaces.mockReset().mockImplementation(async (canvas: HTMLCanvasElement) => [{
    box: { x: .25 * canvas.width, y: .12 * canvas.height, w: .1 * canvas.width, h: .16 * canvas.height },
    descriptor: [0, 0], score: .95, landmarks: [],
  }]);
  vi.spyOn(performance, 'now').mockImplementation(() => model.now);
  const context = { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(320 * 180 * 4), width: 320, height: 180 }) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob()));
  function Harness() {
    const video = useRef(document.createElement('video')), canvas = useRef(document.createElement('canvas'));
    for (const [name, value] of Object.entries({ videoWidth: 1280, videoHeight: 720, readyState: 4 })) {
      Object.defineProperty(video.current, name, { configurable: true, value });
    }
    useVision(video, canvas, { ready: true, cam: 'UPPER', replayName: 'upper body fixture', state: room, privacy: false, debug: true });
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(() => root!.render(<Harness />));
  for (let t = 0; t <= 6500; t += 100) {
    model.now = t; await act(async () => { model.frame?.(); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  const rendered = model.overlay.mock.calls.at(-1)![1];
  expect(rendered).toHaveLength(1);
  expect(rendered[0].track).toMatchObject({ id: 'body-1', source: 'face', match: { visitId: 'ama' } });
  expect(rendered[0].track.face.box.x).toBeCloseTo(160);
  expect(rendered[0].track.face.box.y).toBeCloseTo(43.2);
  expect(rendered[0].pose).toBe(upper);
  expect(rendered[0].reading.referenceReady).toBe(true);
  expect(model.observations.mock.calls.at(-1)![0][0]).toMatchObject({ visitId: 'ama', posture: { fallSuspected: false, slumpSec: 0 } });
});
