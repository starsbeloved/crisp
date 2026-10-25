import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { replaySource, scheduleVideoFrame } from '../lib/camera.ts';
import { detectFaces, loadFaceModels, type DetectedFace } from '../lib/face.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { useVideoSource } from '../lib/useVideoSource.ts';
import { Card } from '../ui/Card.tsx';
import { Chip } from '../ui/Chip.tsx';
export function CameraPage() {
  const { connected, state } = useRoomState();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [replay] = useState(replaySource);
  const cam = new URLSearchParams(location.search).get('cam') || 'A';
  const { ready, message } = useVideoSource(video, true, replay);
  const [models, setModels] = useState('Loading face models…');
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);
  useEffect(() => { let active = true; loadFaceModels().then(() => { if (active) setModels('Face models loaded'); }).catch(() => { if (active) setModels('Face models unavailable'); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!ready || !video.current || !canvas.current) return;
    const source = video.current, output = canvas.current, ctx = output.getContext('2d');
    if (!ctx) return;
    let stopped = false, detecting = false, uploading = false;
    let faces: DetectedFace[] = [];
    let lastFrame = -Infinity, lastDetection = -Infinity;
    let cancel = () => {};
    let latest: Blob | null = null;
    const sourceKind = replay ? 'replay' : 'live';
    const reportVisibility = () => { if (latest) void api.frame(cam, latest, sourceKind).catch(() => setError('Frame upload unavailable')); };
    document.addEventListener('visibilitychange', reportVisibility);
    function frame() {
      if (stopped) return;
      cancel = scheduleVideoFrame(source, frame);
      const now = performance.now();
      if (source.readyState < 2 || now - lastFrame < 200 || !source.videoWidth) return;
      lastFrame = now;
      if (output.width !== source.videoWidth || output.height !== source.videoHeight) { output.width = source.videoWidth; output.height = source.videoHeight; }
      ctx!.drawImage(source, 0, 0, output.width, output.height);
      ctx!.lineWidth = 3; ctx!.strokeStyle = '#246B45'; ctx!.font = '18px system-ui';
      for (const face of faces) {
        ctx!.strokeRect(face.box.x, face.box.y, face.box.w, face.box.h);
        ctx!.fillStyle = '#246B45'; ctx!.fillText(`Face · ${Math.round(face.score * 100)}%`, face.box.x, Math.max(25, face.box.y - 8));
      }
      ctx!.fillStyle = '#1D1D1F'; ctx!.fillRect(0, output.height - 34, output.width, 34);
      ctx!.fillStyle = '#FFF'; ctx!.fillText(`${replay ? 'REPLAY' : 'LIVE'} · Camera ${cam} · Camera estimates: measuring…`, 10, output.height - 11);
      if (!uploading) {
        uploading = true;
        output.toBlob(blob => {
          if (!blob || stopped) { uploading = false; return; }
          latest = blob;
          void api.frame(cam, blob, sourceKind).then(() => { if (!stopped) setError(''); }).catch(() => { if (!stopped) setError('Frame upload unavailable'); }).finally(() => { uploading = false; });
        }, 'image/jpeg', 0.75);
      }
      if (!detecting && now - lastDetection >= 400) {
        detecting = true; lastDetection = now;
        void detectFaces(source).then(result => { if (!stopped) { faces = result; setCount(result.length); } }).catch(() => { if (!stopped) setModels('Face detection unavailable'); }).finally(() => { detecting = false; });
      }
    }
    cancel = scheduleVideoFrame(source, frame);
    return () => { stopped = true; cancel(); document.removeEventListener('visibilitychange', reportVisibility); };
  }, [ready, replay, cam]);
  return <><h1>Room camera</h1><p>Camera {cam} · {connected ? 'Connected' : 'Connecting…'}</p><Card>
    <Chip>{replay ? `REPLAY: ${replay.split('/').pop()}` : 'LIVE'}</Chip><p>{message} · {models} · {count} faces</p>
    <video ref={video} muted playsInline autoPlay className="source-video" aria-label="Camera source" />
    <canvas ref={canvas} className="camera-canvas" aria-label="Face detection overlay" />
    {error && <p role="status">{error}</p>}<p>{state?.cameras[cam] ? `Streaming · ${state.cameras[cam].fps.toFixed(1)} fps` : 'Waiting for frames'}</p>
  </Card></>;
}
