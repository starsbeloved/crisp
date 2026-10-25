import { useEffect, useRef, useState, type RefObject } from 'react';
import type { GalleryEntry, Visit } from '../../shared/types.ts';
import { replaySource } from '../lib/camera.ts';
import { useVideoSource } from '../lib/useVideoSource.ts';
import { examVisits, recognizeArrival } from './model.ts';

export function useExamRecognition(video: RefObject<HTMLVideoElement | null>, visits: Visit[], room: string, active: boolean, onRecognized: (id: string) => void) {
  const replay = replaySource();
  const { ready, message } = useVideoSource(video, active, replay);
  const [status, setStatus] = useState('Camera off');
  const current = useRef({ visits, onRecognized }); current.current = { visits, onRecognized };
  const gallery = useRef<GalleryEntry[]>([]);
  const key = examVisits(visits, room).map(visit => `${visit.id}:${visit.faceEnrolled}`).join('|');
  useEffect(() => {
    gallery.current = [];
    if (!active) return;
    const abort = new AbortController();
    async function refresh() {
      try {
        const response = await fetch(`/api/exam/gallery?${new URLSearchParams({ room })}`, { signal: abort.signal });
        if (!response.ok) throw new Error();
        const entries: GalleryEntry[] = await response.json();
        if (!abort.signal.aborted) gallery.current = entries;
      } catch { if (!abort.signal.aborted) { gallery.current = []; setStatus('Recognition gallery unavailable'); } }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    return () => { abort.abort(); clearInterval(timer); gallery.current = []; };
  }, [key, room, active]);
  useEffect(() => {
    if (!ready || !active) { setStatus(message); return; }
    let disposed = false, busy = false, previous: string | null = null, consecutive = 0, announced: string | null = null;
    setStatus('Loading recognition models…');
    async function detect() {
      if (busy || disposed || !video.current || video.current.readyState < 2) return;
      busy = true;
      try {
        const { detectFaces } = await import('../lib/face.ts');
        if (disposed) return;
        const faces = await detectFaces(video.current);
        if (disposed) return;
        const id = recognizeArrival(faces, gallery.current, current.current.visits, room);
        consecutive = id && id === previous ? consecutive + 1 : id ? 1 : 0; previous = id;
        if (id && consecutive >= 3) {
          setStatus(`${replay ? 'REPLAY · ' : ''}Face recognized`);
          if (announced !== id) { announced = id; current.current.onRecognized(id); }
        } else setStatus(faces.length > 1 ? 'Only one person, please' : faces.length ? 'Identifying…' : 'Waiting for a face');
      } catch { if (!disposed) setStatus('Recognition unavailable — chart can still preload on call-in'); }
      finally { busy = false; }
    }
    void detect(); const timer = setInterval(() => void detect(), 400);
    return () => { disposed = true; clearInterval(timer); };
  }, [ready, active, message, room, replay, video]);
  return { status, replay: Boolean(replay) };
}
