import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { replaySource, scheduleVideoFrame } from '../lib/camera.ts';
import { detectFaces } from '../lib/face.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { useVideoSource } from '../lib/useVideoSource.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Crisp } from '../ui/Crisp.tsx';
import { CrispAgent } from './agent/CrispAgent.tsx';
export function CheckInPage() {
  const { connected, state } = useRoomState();
  const [faceStep, setFaceStep] = useState(false);
  const [name, setName] = useState('Test visitor');
  const [replay] = useState(replaySource);
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [faceMessage, setFaceMessage] = useState('Face scan optional');
  const [queueNo, setQueueNo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const { ready, message } = useVideoSource(video, faceStep, replay);
  useEffect(() => {
    if (!faceStep || !ready || !video.current) return;
    const source = video.current;
    let stopped = false, detecting = false, last = -Infinity;
    let cancel = () => {};
    function scan() {
      if (stopped) return;
      cancel = scheduleVideoFrame(source, scan);
      if (detecting || performance.now() - last < 500 || source.readyState < 2) return;
      detecting = true; last = performance.now();
      void detectFaces(source).then(faces => {
        if (stopped) return;
        if (faces.length === 1) { setDescriptor(faces[0].descriptor); setFaceMessage('Face detected and ready to save'); }
        else { setDescriptor(null); setFaceMessage(faces.length ? 'Only one person please' : 'Look toward the camera'); }
      }).catch(() => { if (!stopped) setFaceMessage('Face models unavailable — you can skip'); }).finally(() => { detecting = false; });
    }
    cancel = scheduleVideoFrame(source, scan);
    return () => { stopped = true; cancel(); };
  }, [faceStep, ready]);
  async function createVisit() {
    setBusy(true); setError(''); setFaceStep(false);
    try {
      const visit = await api.createVisit({ name: name.trim() || 'Test visitor', descriptor, answers: { reason: 'Test check-in', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' } });
      setQueueNo(visit.queueNo);
    } catch (e) { setError(e instanceof Error ? e.message : 'Check-in unavailable'); }
    finally { setBusy(false); }
  }
  return <><h1>Check in with Crisp</h1><p>{connected ? 'Connected' : 'Connecting…'} · {state?.visits.filter(v => v.status === 'waiting').length ?? 0} waiting</p><Card>
    <Crisp /><CrispAgent /><h2>Welcome. Let’s get you checked in.</h2>
    <label>Your name<input value={name} onChange={event => setName(event.target.value)} /></label>
    <div className="actions"><Button onClick={() => setFaceStep(value => !value)}>{faceStep ? 'Finish face step' : 'Open face step'}</Button><Button onClick={() => { setDescriptor(null); setFaceStep(false); setFaceMessage('Face scan skipped'); }}>Skip face</Button></div>
    <video ref={video} autoPlay muted playsInline hidden={!faceStep} aria-label="Check-in camera preview" />
    <p>{faceStep ? `${replay ? 'REPLAY · ' : ''}${message} · ${faceMessage}` : `${faceMessage}. Camera released.`}</p>
    <Button onClick={() => void createVisit()} disabled={busy}>{busy ? 'Creating…' : 'Create test visit'}</Button>
    {queueNo !== null && <p role="status">You’re checked in. You’re number {queueNo}. Please take a seat.</p>}{error && <p role="alert">{error}</p>}
  </Card></>;
}
