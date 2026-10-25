// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCheckIn, type CheckInState } from '../controller.ts';
import { detectFaces } from '../../lib/face.ts';
import { openCamera } from '../../lib/camera.ts';
import { createAppServer } from '../../../server/http.ts';
import type { AddressInfo } from 'node:net';
const realFetch = globalThis.fetch;

vi.mock('../../lib/face.ts', () => ({ loadFaceModels: vi.fn().mockResolvedValue(undefined), detectFaces: vi.fn().mockResolvedValue([]) }));
vi.mock('../../lib/camera.ts', async importOriginal => ({ ...await importOriginal<object>(), openCamera: vi.fn() }));
let current: CheckInState;
let root: Root;
let container: HTMLDivElement;
let stop: ReturnType<typeof vi.fn>;
let posted: Array<Record<string, unknown>>;
let request: ReturnType<typeof vi.fn>;
function Harness() {
  current = useCheckIn();
  return <video ref={current.videoRef} />;
}
async function mount() {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
}
function fill() {
  current.setName('  Ama  ');
  current.setAnswers({ reason: 'Headache', onset: 'today', trend: 'same' });
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  stop = vi.fn();
  vi.mocked(openCamera).mockResolvedValue({ getTracks: () => [{ stop, onended: null }], getVideoTracks: () => [] } as unknown as MediaStream);
  vi.mocked(detectFaces).mockResolvedValue([]);
  posted = [];
  request = vi.fn(async (_url: string, init?: RequestInit) => {
    posted.push(JSON.parse(init?.body as string));
    return new Response(JSON.stringify({ queueNo: 7 }), { status: 201 });
  });
  vi.stubGlobal('fetch', request);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
describe('check-in controller', () => {
  it('lets voice tools jump from Welcome to Done and submits their latest synchronous edits', async () => {
    await mount();
    await act(async () => {
      current.setVia('voice'); fill(); current.skipFace();
      current.setFollowUp('Anything else?', 'Since breakfast');
      await current.finish();
    });
    expect(current.step).toBe('done'); expect(current.queueNo).toBe(7);
    expect(posted).toEqual([{ name: 'Ama', descriptor: null, answers: { reason: 'Headache', reasonChips: [], onset: 'today', trend: 'same', followUp: { question: 'Anything else?', answer: 'Since breakfast' }, via: 'voice' } }]);
  });
  it('waits for the server and shares an in-flight submit, including after Done', async () => {
    let complete!: (value: Response) => void;
    request.mockImplementation(() => new Promise<Response>(resolve => { complete = resolve; }));
    await mount();
    let first!: ReturnType<typeof current.finish>, second!: ReturnType<typeof current.finish>;
    await act(async () => { fill(); first = current.finish(); second = current.finish(); });
    expect(current.step).not.toBe('done'); expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { complete(new Response(JSON.stringify({ queueNo: 9 }))); await Promise.all([first, second]); await current.finish(); });
    expect(current.queueNo).toBe(9); expect(request).toHaveBeenCalledTimes(1);
  });
  it('keeps answers on a failed request and allows retry', async () => {
    request.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await mount();
    await act(async () => { fill(); await expect(current.finish()).rejects.toThrow(); });
    expect(current.step).not.toBe('done'); expect(current.error).toBeTruthy(); expect(current.name).toBe('  Ama  ');
    await act(async () => { await current.finish(); });
    expect(current.step).toBe('done'); expect(posted[0].name).toBe('Ama');
  });
  it('rejects an empty name or complaint before making a visit', async () => {
    await mount();
    await act(async () => { await expect(current.finish()).rejects.toThrow(); current.setName('Ama'); await expect(current.finish()).rejects.toThrow(); });
    expect(request).not.toHaveBeenCalled(); expect(current.queueNo).toBeNull();
  });
  it('clears every field automatically ten seconds after Done', async () => {
    await mount();
    await act(async () => { fill(); current.setVia('voice'); current.skipFace(); current.setFollowUp('Question?', 'Answer'); await current.finish(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(current).toMatchObject({ step: 'welcome', name: '', queueNo: null, via: 'form', face: { status: 'idle' }, answers: { reason: '', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' } });
  });
  it('starts scanning from code, saves five samples and releases the camera on leaving', async () => {
    await mount();
    vi.mocked(detectFaces).mockResolvedValue([{ box: { x: 0, y: 0, w: 150, h: 180 }, score: 0.95, descriptor: Array(128).fill(0.2), landmarks: [] }]);
    Object.defineProperty(container.querySelector('video')!, 'readyState', { value: 4 });
    let scanned!: ReturnType<typeof current.startFaceScan>;
    await act(async () => { scanned = current.startFaceScan(); });
    expect(current.step).toBe('face');
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(await scanned).toEqual({ ok: true, reason: null }); expect(current.face.status).toBe('saved');
    await act(async () => { fill(); current.goTo('questions'); });
    expect(stop).toHaveBeenCalled();
    await act(async () => { await current.finish(); });
    expect(posted[0].descriptor).toEqual(Array(128).fill(0.2));
  });
  it('persists the enrolled 128-dimensional descriptor through the real server gallery', async () => {
    await mount();
    vi.mocked(detectFaces).mockResolvedValue([{ box: { x: 0, y: 0, w: 150, h: 180 }, score: 0.95, descriptor: Array(128).fill(0.125), landmarks: [] }]);
    Object.defineProperty(container.querySelector('video')!, 'readyState', { value: 4 });
    await act(async () => { void current.startFaceScan(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    vi.useRealTimers();
    const { server } = createAppServer({ readProviders: false, dataDir: null });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => realFetch(new URL(url, base), init));
    try {
      await act(async () => { fill(); await current.finish(); });
      expect(current).toMatchObject({ step: 'done', queueNo: 1 });
      const gallery = await (await realFetch(`${base}/api/gallery`)).json();
      expect(gallery).toHaveLength(1);
      expect(gallery[0]).toMatchObject({ name: 'Ama', descriptor: Array(128).fill(0.125) });
    } finally {
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    }
  });
  it('resolves a scan timeout honestly without saving any descriptor', async () => {
    await mount();
    let scanned!: ReturnType<typeof current.startFaceScan>;
    await act(async () => { scanned = current.startFaceScan(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(await scanned).toMatchObject({ ok: false });
    expect(current.face.status).toBe('failed'); expect(stop).toHaveBeenCalled();
    await act(async () => { fill(); await current.finish(); });
    expect(posted[0].descriptor).toBeNull();
  });
  it('keeps a voice follow-up when an earlier form request returns late', async () => {
    let complete!: (response: Response) => void;
    request.mockImplementation(() => new Promise<Response>(resolve => { complete = resolve; }));
    await mount();
    let pending!: Promise<void>;
    await act(async () => { fill(); pending = current.prepareFollowUp(); current.setFollowUp('Voice question?', 'Voice answer'); });
    await act(async () => { complete(new Response(JSON.stringify({ question: 'Older form question?' }))); await pending; });
    expect(current.followUpQuestion).toBe('Voice question?');
    expect(current.followUpLoading).toBe(false);
    expect(current.answers.followUp).toEqual({ question: 'Voice question?', answer: 'Voice answer' });
  });
  it('does not attach a previous follow-up answer to a corrected complaint', async () => {
    await mount();
    await act(async () => { fill(); current.setFollowUp('Where is the headache?', 'Left side'); current.setAnswers({ reason: 'Ankle injury' }); });
    expect(current.answers.followUp).toBeNull();
  });
  it('resolves a programmatic scan on skip and never saves multiple faces', async () => {
    await mount();
    const face = { box: { x: 0, y: 0, w: 150, h: 180 }, score: 0.95, descriptor: Array(128).fill(0.2), landmarks: [] };
    vi.mocked(detectFaces).mockResolvedValue([face, face]);
    Object.defineProperty(container.querySelector('video')!, 'readyState', { value: 4 });
    let scanned!: ReturnType<typeof current.startFaceScan>;
    await act(async () => { scanned = current.startFaceScan(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(current.face.message).toBe('Only one person, please');
    await act(async () => { current.skipFace(); });
    expect(await scanned).toMatchObject({ ok: false }); expect(stop).toHaveBeenCalled();
    await act(async () => { fill(); await current.finish(); });
    expect(posted[0].descriptor).toBeNull();
  });
});
