import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { replaySource } from '../lib/camera.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { Card } from '../ui/Card.tsx';
import { Chip } from '../ui/Chip.tsx';
import { useCameraSource } from './useCameraSource.ts';
import { useVision } from './useVision.ts';

export function CameraPage() {
  const { connected, state } = useRoomState();
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [replay, setReplay] = useState<string | null>(replaySource);
  const [filename, setFilename] = useState(() => replaySource()?.split('/').pop() ?? null);
  const cam = (new URLSearchParams(location.search).get('cam') || 'A').slice(0, 80);
  const privacy = new URLSearchParams(location.search).get('privacy') === '1';
  const [deviceId, setDeviceId] = useState(() => { try { return localStorage.getItem(`crisp-camera-${cam}`) || ''; } catch { return ''; } });
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState('');
  const [saving, setSaving] = useState(false);
  const { ready, message, devices } = useCameraSource(video, cam, replay, deviceId);
  const vision = useVision(video, canvas, { ready, cam, replayName: replay ? filename || 'local video' : null, state, privacy });
  useEffect(() => () => { if (replay?.startsWith('blob:')) URL.revokeObjectURL(replay); }, [replay]);
  async function correct(visitId: string) {
    const track = vision.tracker.current.current(performance.now()).find(item => item.id === selectedTrack);
    const visit = state?.visits.find(item => item.id === visitId && item.status === 'waiting');
    if (!track || !visit) { setCorrectionError('Face no longer visible. Click it again.'); return; }
    setSaving(true); setCorrectionError('');
    try {
      await api.addDescriptor(visit.id, track.face.descriptor);
      await vision.refreshGallery();
      vision.tracker.current.assign(track.id, { visitId: visit.id, name: visit.name, score: 1 });
      setSelectedTrack(null);
    } catch { setCorrectionError('Could not save correction. Try again.'); }
    finally { setSaving(false); }
  }
  return <><h1>Room camera</h1><p>Camera {cam} · {connected ? 'Connected' : 'Connecting…'}</p><Card>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
      <label>Camera source<select aria-label="Camera source" value={deviceId} onChange={event => { setDeviceId(event.target.value); setReplay(null); setFilename(null); }} style={{ display: 'block', minHeight: 44, maxWidth: 320 }}>
        <option value="">Default camera</option>{devices.map((device, i) => <option key={device.deviceId || i} value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>)}
      </select></label>
      <label>Replay file<input aria-label="Replay file" type="file" accept="video/*" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        setFilename(file.name); setReplay(URL.createObjectURL(file)); setSelectedTrack(null);
      }} /></label>
      {replay && <button onClick={() => { setReplay(null); setFilename(null); setSelectedTrack(null); }}>Use live camera</button>}
    </div>
    <p><Chip>{replay ? `REPLAY: ${filename}` : 'LIVE'}</Chip><Chip>{vision.stats.fps.toFixed(1)} fps</Chip><Chip>{vision.stats.count} faces</Chip>{privacy && <Chip>Unknown faces blurred</Chip>}</p>
    <p role="status">{message} · {vision.models} · {vision.poseStatus}</p>
    <video ref={video} muted playsInline autoPlay className="source-video" aria-label="Camera source video" />
    <canvas ref={canvas} className="camera-canvas" aria-label="Face detection overlay" onClick={event => {
      const element = canvas.current; if (!element) return;
      const bounds = element.getBoundingClientRect();
      const x = (event.clientX - bounds.left) * element.width / bounds.width, y = (event.clientY - bounds.top) * element.height / bounds.height;
      const track = vision.tracker.current.current(performance.now()).find(item => x >= item.face.box.x && x <= item.face.box.x + item.face.box.w && y >= item.face.box.y && y <= item.face.box.y + item.face.box.h);
      setSelectedTrack(track?.id ?? null); setCorrectionError('');
    }} />
    <details><summary>Staff identity correction</summary><p>Click a face box, then choose the waiting patient.</p>
      {selectedTrack && <p>Selected {selectedTrack}</p>}
      <div className="actions" style={{ flexWrap: 'wrap' }}>{state?.visits.filter(visit => visit.status === 'waiting').map(visit => <button key={visit.id} disabled={!selectedTrack || saving} onClick={() => void correct(visit.id)}>{visit.name} · #{visit.queueNo}</button>)}</div>
      {!state?.visits.some(visit => visit.status === 'waiting') && <p>No waiting visits.</p>}
      {correctionError && <p role="alert">{correctionError}</p>}
    </details>
    {vision.error && <p role="alert">{vision.error}</p>}
    <p>{state?.cameras[cam] ? `Streaming · ${state.cameras[cam].fps.toFixed(1)} fps` : 'Waiting for frames'} · Camera estimates; not a diagnosis.</p>
  </Card></>;
}
