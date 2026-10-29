import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { GalleryEntry, RoomState } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { scheduleVideoFrame } from '../lib/camera.ts';
import { detectFaces, disposeFaceModels, faceMemory, loadFaceModels } from '../lib/face.ts';
import { createSignalTracker, type SignalTracker, type PoseSample } from './signals/index.ts';
import { BodyTracker, FaceTracker, poseForFace, type BodyTrack } from './tracking.ts';
import { meanCheekSample } from './sampling.ts';
import { drawOverlay, type RenderTrack } from './overlay.ts';
import { makeObservation } from './output.ts';
import { loadPoseModel } from './pose.ts';
import { debugReading } from './debug.ts';
import { usePageActive } from './usePageActive.ts';
import { withFaceMotion } from './signals/faceMotion.ts';

export function useVision(videoRef: RefObject<HTMLVideoElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>,
  options: { ready: boolean; cam: string; replayName: string | null; state: RoomState | null; privacy: boolean; debug?: boolean }) {
  const pageActive = usePageActive();
  const [memory, setMemory] = useState('Memory: waiting for sample');
  const [models, setModels] = useState('Loading face models…');
  const [poseStatus, setPoseStatus] = useState('Pose model: loading');
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ fps: 0, count: 0 });
  const [debugTracks, setDebugTracks] = useState<string[]>([]);
  const pose = useRef<PoseLandmarker | null>(null);
  const poseStatusRef = useRef(poseStatus);
  poseStatusRef.current = poseStatus;
  const faceReady = useRef(false);
  const tracker = useRef(new FaceTracker());
  const gallery = useRef<GalleryEntry[]>([]);
  const room = useRef(options.state); room.current = options.state;
  const refreshGallery = async () => {
    try { const entries = await api.gallery(); gallery.current = entries; tracker.current.setGallery(entries); }
    catch { setError('Identity gallery unavailable — retrying'); }
  };
  const refresh = useRef(refreshGallery); refresh.current = refreshGallery;
  const visitsKey = options.state?.visits.map(visit => `${visit.id}:${visit.status}:${visit.faceEnrolled}`).join('|');
  useEffect(() => { void refresh.current(); }, [visitsKey]);
  useEffect(() => {
    const timer = setInterval(() => void refresh.current(), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!pageActive) { setModels('Face models paused'); setPoseStatus('Pose model: paused'); return; }
    let active = true;
    setModels('Loading face models…'); setPoseStatus('Pose model: loading');
    void (async () => {
      try {
        await loadFaceModels();
        if (!active) return;
        const blank = document.createElement('canvas'); blank.width = 320; blank.height = 240;
        await detectFaces(blank);
        if (active) { faceReady.current = true; setModels('Face models ready'); }
      } catch { if (active) setModels('Face models unavailable — reload to retry'); }
    })();
    void (async () => {
      try {
        const result = await loadPoseModel(new URLSearchParams(location.search).get('pose') === 'gpu' ? 'GPU' : 'CPU');
        if (active) { pose.current = result.model; setPoseStatus(`Pose model: ready · ${result.delegate}`); } else result.model.close();
      } catch (error) {
        if (active) setPoseStatus(`Pose model: error ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    const stop = () => {
      if (!active) return;
      active = false; faceReady.current = false; pose.current?.close(); pose.current = null;
      void disposeFaceModels();
    };
    const visibility = () => { if (document.visibilityState === 'hidden') stop(); };
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', visibility);
    return () => { stop(); window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', visibility); };
  }, [pageActive]);

  useEffect(() => {
    if (!pageActive || !options.ready || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current, output = canvasRef.current;
    const ctx = output.getContext('2d');
    // One reusable, unmirrored processing surface for sampling, face snapshots and pose.
    const sampleCanvas = document.createElement('canvas');
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !sampleCtx) return;
    tracker.current = new FaceTracker();
    setDebugTracks([]);
    const bodies = new BodyTracker();
    const signals = new Map<string, { visitId: string; tracker: SignalTracker }>();
    const missingBodies = new Map<string, { track: BodyTrack; until: number }>();
    const reportedPosture = new Map<string, string>();
    let stopped = false, faceDetecting = false, uploading = false, reporting = false;
    let cancel = () => {};
    let lastFaceAt = -Infinity, lastPoseAt = -Infinity, lastUpload = -Infinity, lastReport = -Infinity, lastStats = performance.now(), frameCount = 0, fps = 0;
    const poseInterval = 80, faceInterval = 250;
    let poseDetecting = false;
    let poses: PoseSample['landmarks'][] = [], poseAt = -Infinity, appliedPoseAt = -Infinity;
    const source = options.replayName ? 'replay' : 'live';
    function frame() {
      if (stopped) return;
      cancel = scheduleVideoFrame(video, frame);
      const now = performance.now();
      if (video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
      if (output.width !== width || output.height !== height) {
        output.width = width; output.height = height;
        sampleCanvas.width = width; sampleCanvas.height = height;
      }
      sampleCtx!.drawImage(video, 0, 0, width, height);
      frameCount++;
      const faces = tracker.current.current(now);
      if (poseAt !== appliedPoseAt) {
        const previousBodies = bodies.current(now);
        bodies.update(poses, faces, gallery.current, poseAt, width, height); appliedPoseAt = poseAt;
        const currentIds = new Set(bodies.current(now).map(track => track.id));
        for (const track of previousBodies) if (!currentIds.has(track.id)) {
          const signal = signals.get(track.id);
          signal?.tracker.pushPose({ t: poseAt, landmarks: [] });
          if (track.match && signal?.tracker.read(now).posture?.fallSuspected) {
            missingBodies.set(track.id, { track: { ...track, source: 'body' }, until: now + 1500 });
          }
        }
        for (const [id, entry] of missingBodies) if (now > entry.until || currentIds.has(id)) missingBodies.delete(id);
      }
      const bodyTracks = [...bodies.current(now), ...[...missingBodies.values()].map(entry => entry.track)];
      // A face can still be monitored when its torso is outside the image.
      const tracks = [...bodyTracks, ...faces.filter(face => !bodyTracks.some(body =>
        poseForFace(face.face.box, [body.pose], width, height) || face.match && body.match?.visitId === face.match.visitId))];
      const pixels = tracks.some(track => track.source !== 'body' && track.match) ? (() => {
        return sampleCtx!.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
      })() : null;
      const activeIds = new Set(tracks.map(track => track.id));
      for (const id of signals.keys()) if (!activeIds.has(id)) signals.delete(id);
      const rendered: RenderTrack[] = tracks.map(track => {
        let signal = signals.get(track.id);
        const visitId = track.match?.visitId ?? '';
        if (!signal || signal.visitId !== visitId) {
          signal = { visitId, tracker: createSignalTracker() }; signals.set(track.id, signal);
        }
        const assignedPose = 'pose' in track && !missingBodies.has(track.id) && now - poseAt < 700 ? track.pose as PoseSample['landmarks'] : null;
        if (signal) {
          const sample = pixels && track.source !== 'body' && !track.faceMissing ? meanCheekSample(pixels, track.face, width, height, now, video.videoWidth) : null;
          if (sample) signal.tracker.pushFace(sample);
          // Count only fresh model results, never repeat a cached pose as evidence.
          if (assignedPose) signal.tracker.pushPose({ t: poseAt, landmarks: assignedPose });
        }
        let reading = signal?.tracker.read(now) ?? { hrBpm: null, hrQuality: 'none' as const, rrBpm: null, rrQuality: 'none' as const, posture: null, hint: null, hrSecondsCollected: 0, pulseTrace: null, velocity: 0 };
        const faceTrackId = 'faceTrackId' in track ? track.faceTrackId : track.id;
        const faceTrack = faces.find(face => face.id === faceTrackId && face.match?.visitId === track.match?.visitId);
        reading = withFaceMotion(reading, faceTrack?.faceMotion);
        if (track.source === 'body' || track.faceMissing) reading = { ...reading, hrBpm: null, hrQuality: 'low', pulseTrace: null,
          hint: track.faceMissing ? 'Face left view after downward movement' : missingBodies.has(track.id) ? 'Body left view after fast downward movement' : 'Face hidden — tracking body',
          hrDisplay: undefined };
        return { track, pose: assignedPose, reading };
      });
      ctx!.drawImage(video, 0, 0, width, height);
      drawOverlay(ctx!, rendered, room.current, { ...options, fps, now, modelStatus: poseStatusRef.current });
      if (now - lastStats >= 1000) {
        fps = frameCount * 1000 / (now - lastStats); frameCount = 0; lastStats = now;
        setStats({ fps, count: tracks.length });
        if (options.debug) {
          setDebugTracks(rendered.map(debugReading));
          const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
          const face = faceMemory(), mb = (bytes: number) => (bytes / 1048576).toFixed(1);
          setMemory(`JS heap: ${heap === undefined ? 'unavailable' : mb(heap) + ' MiB'} · TF: ${face.tensors} tensors / ${mb(face.bytes)} MiB · TF GPU: ${face.gpuBytes === null ? 'unavailable' : mb(face.gpuBytes) + ' MiB'} · TF GPU pool: ${face.gpuAllocatedBytes == null ? 'unavailable' : mb(face.gpuAllocatedBytes) + ' MiB'} · input: ${width}×${height}`);
        }
      }
      const urgent = rendered.filter(({ track, reading }) => track.match &&
        (reading.posture?.fallSuspected || (reading.posture?.headDropSec ?? 0) >= 3));
      const newUrgent = urgent.some(({ track, reading }) => reportedPosture.get(track.id) !== (reading.posture?.fallSuspected ? 'fall' : 'headDrop'));
      if ((now - lastReport >= 1000 || newUrgent) && !reporting) {
        lastReport = now;
        const observations = rendered.map(({ track, reading }) => makeObservation(track, reading, { cam: options.cam, source, now: Date.now(), width, height }));
        if (observations.length) {
          reporting = true;
          for (const { track, reading } of urgent) reportedPosture.set(track.id, reading.posture?.fallSuspected ? 'fall' : 'headDrop');
          void api.observations(observations).catch(() => { if (!stopped) setError('Observation upload unavailable'); }).finally(() => { reporting = false; });
        }
      }
      // Fractional frame times can miss 200 ms exactly; 195 keeps a 30 fps source at 5 uploads/s.
      if (now - lastUpload >= 195 && !uploading) {
        uploading = true; lastUpload = now;
        output.toBlob(blob => {
          if (stopped || !blob) { uploading = false; return; }
          void api.frame(options.cam, blob, source, document.visibilityState === 'visible')
            .then(() => { if (!stopped) setError(''); })
            .catch(() => { if (!stopped) setError('Frame upload unavailable'); }).finally(() => { uploading = false; });
        }, 'image/jpeg', 0.7);
      }
      // Four fresh face samples/second are needed to catch a quick drop without a skeleton.
      if (!faceDetecting && faceReady.current && now - lastFaceAt >= faceInterval) {
          faceDetecting = true; lastFaceAt = now;
          const largeFaces = faces.length > 0 && faces.every(face => face.face.box.w >= width * .16);
          const smallFaces = !faces.length || faces.some(face => face.face.box.w < 80);
          const sx = width / sampleCanvas.width, sy = height / sampleCanvas.height;
          void detectFaces(sampleCanvas, largeFaces ? 320 : smallFaces ? 640 : 512).then(faces => {
            if (!stopped) tracker.current.update(faces.map(face => ({ ...face,
              box: { x: face.box.x * sx, y: face.box.y * sy, w: face.box.w * sx, h: face.box.h * sy },
              landmarks: face.landmarks.map(p => ({ x: p.x * sx, y: p.y * sy })) })), gallery.current, now);
          })
            .catch(error => { if (!stopped) setModels(`Face models: error ${error instanceof Error ? error.message : String(error)}`); }).finally(() => { faceDetecting = false; });
      }
      if (!poseDetecting && pose.current && now - lastPoseAt >= poseInterval) {
        poseDetecting = true; lastPoseAt = now;
        try { poses = pose.current.detectForVideo(sampleCanvas, now).landmarks; poseAt = now; }
        catch (error) { poses = []; if (!stopped) setPoseStatus(`Pose model: error ${error instanceof Error ? error.message : String(error)}`); }
        finally { poseDetecting = false; }
      }
    }
    cancel = scheduleVideoFrame(video, frame);
    const stop = () => {
      if (stopped) return;
      stopped = true; cancel(); signals.clear(); missingBodies.clear();
      sampleCanvas.width = sampleCanvas.height = 0;
      output.width = output.height = 0;
    };
    const visibility = () => { if (document.visibilityState === 'hidden') stop(); };
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', visibility);
    return () => { stop(); window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', visibility); };
  }, [pageActive, videoRef, canvasRef, options.ready, options.cam, options.replayName, options.privacy, options.debug]);
  return { models, poseStatus, error, stats, memory, debugTracks, tracker, refreshGallery };
}
