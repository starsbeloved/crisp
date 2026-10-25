import { useEffect, useState, type RefObject } from 'react';
import { usePageActive } from './usePageActive.ts';
import { listCameras, openCamera } from '../lib/camera.ts';

export function useCameraSource(videoRef: RefObject<HTMLVideoElement | null>, cam: string, replay: string | null, deviceId: string) {
  const pageActive = usePageActive();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Opening camera…');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void listCameras().then(items => { if (active) setDevices(items); }).catch(() => {}); };
    refresh(); navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => { active = false; navigator.mediaDevices?.removeEventListener('devicechange', refresh); };
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !pageActive) { setReady(false); setMessage('Camera paused while page is hidden'); return; }
    let disposed = false, stream: MediaStream | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    const release = () => { stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; video.srcObject = null; };
    const failure = () => { if (!disposed) { setReady(false); setMessage('Replay could not load. Choose a playable local video.'); } };
    async function start() {
      if (disposed) return;
      setReady(false); setMessage(replay ? 'Loading REPLAY…' : 'Opening camera…');
      release();
      try {
        if (replay) { video!.src = replay; video!.loop = true; }
        else {
          let acquired: MediaStream;
          try {
            acquired = await openCamera(deviceId || undefined);
          } catch (error) {
            // A remembered Continuity Camera can disappear between sessions.
            // Fall back to the browser default instead of leaving the camera page stuck.
            if (!deviceId) throw error;
            setMessage('Selected camera unavailable — trying default camera…');
            acquired = await openCamera();
          }
          if (disposed) { acquired.getTracks().forEach(track => track.stop()); return; }
          // Keep distant faces at the camera's native detail before detector resizing.
          await acquired.getVideoTracks()[0]?.applyConstraints({ width: { ideal: 1280 }, height: { ideal: 960 } }).catch(() => {});
          if (disposed) { acquired.getTracks().forEach(track => track.stop()); return; }
          stream = acquired; video!.srcObject = stream;
          stream.getVideoTracks().forEach(track => { track.onended = () => {
            if (!disposed) { setReady(false); setMessage('Camera interrupted — reopening…'); retry = setTimeout(() => void start(), 1000); }
          }; });
          try { localStorage.setItem(`crisp-camera-${cam}`, stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId); } catch { /* storage optional */ }
          void listCameras().then(items => { if (!disposed) setDevices(items); }).catch(() => {});
        }
        await video!.play();
        if (!disposed) { setReady(true); setMessage(replay ? 'REPLAY source ready' : 'Camera ready'); }
      } catch (error) {
        if (!disposed) { setReady(false); setMessage(error instanceof Error ? error.message : 'Camera unavailable'); }
      }
    }
    video.addEventListener('error', failure); void start();
    const stop = () => { disposed = true; clearTimeout(retry); video.removeEventListener('error', failure); release(); video.pause(); video.removeAttribute('src'); video.load(); };
    const visibility = () => { if (document.visibilityState === 'hidden') stop(); };
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', visibility);
    return () => { stop(); window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', visibility); };
  }, [pageActive, videoRef, cam, replay, deviceId]);
  return { ready, message, devices };
}
