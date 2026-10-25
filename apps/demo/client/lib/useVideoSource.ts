import { useEffect, useState, type RefObject } from 'react';
import { openCamera } from './camera.ts';
export function useVideoSource(videoRef: RefObject<HTMLVideoElement | null>, active: boolean, replay: string | null) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Camera off');
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !active) { setReady(false); setMessage('Camera off'); return; }
    const video: HTMLVideoElement = element;
    let disposed = false;
    let stream: MediaStream | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const failed = () => { setReady(false); setMessage('Replay could not load. Add a local MP4 fixture.'); };
    const release = () => { stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; video.srcObject = null; };
    async function start() {
      setReady(false); setMessage(replay ? 'Loading REPLAY…' : 'Opening camera…');
      try {
        release();
        if (replay) { video.src = replay; video.loop = true; }
        else {
          const acquired = await openCamera();
          if (disposed) { acquired.getTracks().forEach(track => track.stop()); return; }
          stream = acquired; video.srcObject = stream;
          stream.getVideoTracks().forEach(track => { track.onended = () => {
            if (!disposed) { setReady(false); setMessage('Camera interrupted — reopening…'); retry = setTimeout(() => void start(), 1000); }
          }; });
        }
        await video.play();
        if (!disposed) { setReady(true); setMessage(replay ? 'REPLAY source ready' : 'Camera ready'); }
      } catch (error) {
        if (!disposed) { setMessage(error instanceof Error ? error.message : 'Camera unavailable'); setReady(false); }
      }
    }
    video.addEventListener('error', failed);
    void start();
    return () => {
      disposed = true; clearTimeout(retry); release(); video.pause(); video.removeAttribute('src'); video.load(); video.removeEventListener('error', failed);
    };
  }, [videoRef, active, replay]);
  return { ready, message };
}
