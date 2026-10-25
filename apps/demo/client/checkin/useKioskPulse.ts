import { useEffect, useRef, useState, type RefObject } from 'react';
import { detectFaces, faceDistance, type DetectedFace } from '../lib/face.ts';
import { meanCheekSample } from '../camera/sampling.ts';
import { scheduleVideoFrame } from '../lib/camera.ts';
import { createKioskPulse, type KioskPulseSample, type KioskPulseView } from './pulse.ts';

export function useKioskPulse(videoRef: RefObject<HTMLVideoElement | null>, active: boolean, ready: boolean,
  descriptor: number[] | null, onComplete: (samples: KioskPulseSample[], outcome: 'complete' | 'timeout') => void) {
  const [view, setView] = useState<KioskPulseView | null>(null);
  const cameraReady = useRef(ready); cameraReady.current = ready;
  useEffect(() => {
    if (!active) { setView(null); return; }
    const start = performance.now(), session = createKioskPulse(start, Date.now());
    let stopped = false, face: DetectedFace | null = null, faceAt = -Infinity;
    let detecting = false, detectAt = -Infinity, frameReady = false, lastPaint = -Infinity;
    let previousFace: DetectedFace | null = null, motionUntil = -Infinity;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let cancelFrame = () => {};
    function nextFrame() {
      if (stopped || !videoRef.current) return;
      cancelFrame = scheduleVideoFrame(videoRef.current, () => { frameReady = true; nextFrame(); });
    }
    nextFrame();
    function clear() { face = null; previousFace = null; session.missing(); }
    const timer = setInterval(() => {
      if (stopped) return;
      const now = performance.now(), video = videoRef.current;
      if (cameraReady.current && context && video && video.readyState >= 2 && video.videoWidth > 0 && !document.hidden) {
        if (!detecting && now - detectAt >= 200) {
          detecting = true; detectAt = now;
          void detectFaces(video, 320).then(faces => {
            if (stopped) return;
            const next = faces.length === 1 && faces[0].score >= .7 && descriptor && faceDistance(faces[0].descriptor, descriptor) < .5 ? faces[0] : null;
            if (!next || next.landmarks.length !== 68) { clear(); return; }
            const old = previousFace;
            if (old && Math.hypot(next.box.x - old.box.x, next.box.y - old.box.y) / old.box.w > .04) {
              session.missing();
              motionUntil = performance.now() + 700;
            }
            previousFace = next; face = next; faceAt = performance.now();
          }).catch(() => { if (!stopped) clear(); }).finally(() => { detecting = false; });
        }
        if (face && now - faceAt <= 400 && frameReady) {
          frameReady = false;
          canvas.width = 320; canvas.height = Math.max(1, Math.round(320 * video.videoHeight / video.videoWidth));
          try {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const sample = meanCheekSample(context.getImageData(0, 0, canvas.width, canvas.height), face,
              video.videoWidth, video.videoHeight, now, video.videoWidth);
            if (sample) session.push(sample, {
              x: Math.max(0, Math.min(1, face.box.x / video.videoWidth)), y: Math.max(0, Math.min(1, face.box.y / video.videoHeight)),
              w: Math.max(0, Math.min(1, face.box.w / video.videoWidth)), h: Math.max(0, Math.min(1, face.box.h / video.videoHeight)),
            });
            else session.missing();
          } catch { clear(); }
        } else if (!face || now - faceAt > 400) session.missing();
      } else clear();
      const next = session.read(now);
      if (now < motionUntil) next.reading.hint = 'hold still';
      if (now - lastPaint >= 100) { setView(next); lastPaint = now; }
      if (next.expired || (next.elapsed >= 17 && next.reading.hrBpm !== null && ['good', 'fair'].includes(next.reading.hrQuality))) {
        stopped = true; clearInterval(timer); cancelFrame();
        onComplete(session.samples(), next.reading.hrBpm !== null ? 'complete' : 'timeout');
      }
    }, 16);
    return () => { stopped = true; clearInterval(timer); cancelFrame(); session.missing(); };
  }, [active, videoRef, descriptor, onComplete]);
  return view;
}
