import { useEffect, useRef, useState, type RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { GalleryEntry, RoomState } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { scheduleVideoFrame } from '../lib/camera.ts';
import { detectFaces, loadFaceModels } from '../lib/face.ts';
import { createSignalTracker, type SignalTracker, type PoseSample } from './signals/index.ts';
import { BodyTracker, FaceTracker, poseForFace } from './tracking.ts';
import { meanCheekSample } from './sampling.ts';
import { drawOverlay, type RenderTrack } from './overlay.ts';
import { makeObservation } from './output.ts';

export function useVision(videoRef: RefObject<HTMLVideoElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>,
  options: { ready: boolean; cam: string; replayName: string | null; state: RoomState | null; privacy: boolean; debug?: boolean }) {
  const [models, setModels] = useState('Loading face models…');
  const [poseStatus, setPoseStatus] = useState('Loading pose model…');
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ fps: 0, count: 0 });
  const pose = useRef<PoseLandmarker | null>(null);
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
    let active = true;
    void (async () => {
      try {
        await loadFaceModels();
        const blank = document.createElement('canvas'); blank.width = 320; blank.height = 240;
        await detectFaces(blank);
        if (active) { faceReady.current = true; setModels('Face models ready'); }
      } catch { if (active) setModels('Face models unavailable — reload to retry'); }
    })();
    void (async () => {
      try {
        const files = await FilesetResolver.forVisionTasks('/models/mediapipe-1.1.1/wasm');
        const model = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/models/pose/pose_landmarker_lite.task' }, numPoses: 2,
          minPoseDetectionConfidence: .3, minPosePresenceConfidence: .3, minTrackingConfidence: .3, runningMode: 'VIDEO' });
        if (active) { pose.current = model; setPoseStatus('Pose model ready'); } else model.close();
      } catch { if (active) setPoseStatus('Pose unavailable — face monitoring continues'); }
    })();
    return () => { active = false; faceReady.current = false; pose.current?.close(); pose.current = null; };
  }, []);

  useEffect(() => {
    if (!options.ready || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current, output = canvasRef.current;
    const ctx = output.getContext('2d');
    const sampleCanvas = document.createElement('canvas'), detectorCanvas = document.createElement('canvas');
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true }), detectorCtx = detectorCanvas.getContext('2d');
    if (!ctx || !sampleCtx || !detectorCtx) return;
    tracker.current = new FaceTracker();
    const bodies = new BodyTracker();
    const signals = new Map<string, { visitId: string; tracker: SignalTracker }>();
    let stopped = false, detecting = false, uploading = false, reporting = false;
    let cancel = () => {};
    let lastDetector = -Infinity, lastUpload = -Infinity, lastReport = -Infinity, lastStats = performance.now(), frameCount = 0, fps = 0;
    let nextDetector: 'face' | 'pose' = 'face';
    let poses: PoseSample['landmarks'][] = [], poseAt = -Infinity, appliedPoseAt = -Infinity;
    const source = options.replayName ? 'replay' : 'live';
    function frame() {
      if (stopped) return;
      cancel = scheduleVideoFrame(video, frame);
      const now = performance.now();
      if (video.readyState < 2 || !video.videoWidth) return;
      const width = Math.min(640, video.videoWidth), height = Math.round(video.videoHeight * width / video.videoWidth);
      if (output.width !== width || output.height !== height) {
        output.width = width; output.height = height;
        sampleCanvas.width = Math.min(320, width); sampleCanvas.height = Math.round(height * sampleCanvas.width / width);
      }
      frameCount++;
      sampleCtx!.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const pixels = sampleCtx!.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
      const faces = tracker.current.current(now);
      if (poseAt !== appliedPoseAt) {
        bodies.update(poses, faces, gallery.current, poseAt, width, height); appliedPoseAt = poseAt;
      }
      const bodyTracks = bodies.current(now);
      // A face can still be monitored when its torso is outside the image.
      const tracks = [...bodyTracks, ...faces.filter(face => !bodyTracks.some(body =>
        poseForFace(face.face.box, [body.pose], width, height) || face.match && body.match?.visitId === face.match.visitId))];
      const activeIds = new Set(tracks.map(track => track.id));
      for (const id of signals.keys()) if (!activeIds.has(id)) signals.delete(id);
      const rendered: RenderTrack[] = tracks.map(track => {
        let signal = signals.get(track.id);
        if (!track.match) { signals.delete(track.id); signal = undefined; }
        else if (!signal || signal.visitId !== track.match.visitId) {
          signal = { visitId: track.match.visitId, tracker: createSignalTracker() }; signals.set(track.id, signal);
        }
        const assignedPose = 'pose' in track && now - poseAt < 700 ? track.pose as PoseSample['landmarks'] : null;
        if (signal) {
          const sample = track.source !== 'body' ? meanCheekSample(pixels, track.face, width, height, now, video.videoWidth) : null;
          if (sample) signal.tracker.pushFace(sample);
          // Count only fresh model results, never repeat a cached pose as evidence.
          if (assignedPose) signal.tracker.pushPose({ t: poseAt, landmarks: assignedPose });
        }
        let reading = signal?.tracker.read(now) ?? { hrBpm: null, hrQuality: 'none' as const, rrBpm: null, rrQuality: 'none' as const, posture: null, hint: null, hrSecondsCollected: 0, pulseTrace: null };
        if (track.source === 'body') reading = { ...reading, hrBpm: null, hrQuality: 'low', pulseTrace: null, hint: 'Face hidden — tracking body',
          hrDisplay: undefined };
        return { track, pose: assignedPose, reading };
      });
      ctx!.drawImage(video, 0, 0, width, height);
      drawOverlay(ctx!, rendered, room.current, { ...options, fps, now });
      if (now - lastStats >= 1000) {
        fps = frameCount * 1000 / (now - lastStats); frameCount = 0; lastStats = now;
        setStats({ fps, count: tracks.length });
      }
      if (now - lastReport >= 1000 && !reporting) {
        lastReport = now;
        const observations = rendered.map(({ track, reading }) => makeObservation(track, reading, { cam: options.cam, source, now: Date.now(), width, height }));
        if (observations.length) {
          reporting = true;
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
      // One detector per frame, at most 20 combined passes/s. RGB sampling above stays at source fps.
      if (!detecting && now - lastDetector >= 45 && (faceReady.current || pose.current)) {
        const kind = nextDetector === 'face' && faceReady.current ? 'face' : pose.current ? 'pose' : 'face';
        nextDetector = kind === 'face' ? 'pose' : 'face'; lastDetector = now;
        if (kind === 'face' && faceReady.current) {
          detecting = true;
          detectorCanvas.width = video.videoWidth; detectorCanvas.height = video.videoHeight;
          detectorCtx!.drawImage(video, 0, 0);
          const sx = width / detectorCanvas.width, sy = height / detectorCanvas.height;
          void detectFaces(detectorCanvas).then(faces => {
            if (!stopped) tracker.current.update(faces.map(face => ({ ...face,
              box: { x: face.box.x * sx, y: face.box.y * sy, w: face.box.w * sx, h: face.box.h * sy },
              landmarks: face.landmarks.map(p => ({ x: p.x * sx, y: p.y * sy })) })), gallery.current, performance.now());
          })
            .catch(() => { if (!stopped) setModels('Face detection unavailable'); }).finally(() => { detecting = false; });
        } else if (pose.current) {
          try { poses = pose.current.detectForVideo(video, now).landmarks; poseAt = now; }
          catch { poses = []; if (!stopped) setPoseStatus('Pose detection unavailable'); }
        }
      }
    }
    cancel = scheduleVideoFrame(video, frame);
    return () => { stopped = true; cancel(); signals.clear(); };
  }, [videoRef, canvasRef, options.ready, options.cam, options.replayName, options.privacy, options.debug]);
  return { models, poseStatus, error, stats, tracker, refreshGallery };
}
