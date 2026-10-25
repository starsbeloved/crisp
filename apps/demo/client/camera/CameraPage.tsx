import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { replaySource } from '../lib/camera.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { Card } from '../ui/Card.tsx';
import { Chip } from '../ui/Chip.tsx';
import { useCameraSource } from './useCameraSource.ts';
import { useVision } from './useVision.ts';
import { cameraRequests } from './output.ts';
import { RoomView } from '../room/RoomView.tsx';
import './camera.css';

export function CameraPage({ roomView = false }: { roomView?: boolean }) {
  const { connected, state } = useRoomState();
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [replay, setReplay] = useState<string | null>(replaySource);
  const [filename, setFilename] = useState(() => replaySource()?.split('/').pop() ?? null);
  const cam = (new URLSearchParams(location.search).get('cam') || 'A').slice(0, 80);
  const privacy = new URLSearchParams(location.search).get('privacy') !== '0';
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const [deviceId, setDeviceId] = useState(() => { try { return localStorage.getItem(`crisp-camera-${cam}`) || ''; } catch { return ''; } });
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [demoView, setDemoView] = useState(() => !roomView && new URLSearchParams(location.search).get('demo') === '1');
  const [settings, setSettings] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const demoButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!settings) return;
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setSettings(false); settingsButton.current?.focus(); }
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [settings]);
  useEffect(() => {
    if (!demoView) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const header = document.querySelector<HTMLElement>('#root > header');
    if (header) header.inert = true;
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (settings) { setSettings(false); settingsButton.current?.focus(); }
      else { setDemoView(false); demoButton.current?.focus(); }
    }
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; if (header) header.inert = false; window.removeEventListener('keydown', escape); };
  }, [demoView, settings]);
  const { ready, message, devices } = useCameraSource(video, cam, replay, deviceId);
  const vision = useVision(video, canvas, { ready, cam, replayName: replay ? filename || 'local video' : null, state, privacy, debug });
  const requests = cameraRequests(state);
  const frame = state?.cameras[cam];
  const streaming = ready && connected && vision.stats.fps > 0 && !!frame && frame.visible && now - frame.lastFrameAt <= 2000;
  const sourceStatus = replay ? 'REPLAY' : streaming ? 'LIVE' : ready ? 'Waiting for frames' : 'Camera not ready';
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
  const Heading = roomView ? 'h2' : 'h1';
  const camera = <div className={`camera-page${demoView ? ' camera-demo-view' : ''}`}><div className="camera-page-heading"><div><p className="camera-eyebrow">Crisp · room camera</p><Heading>Room camera <span className="camera-id">{cam}</span></Heading><p>{connected ? 'Connected to the waiting room' : 'Connecting to the waiting room…'}</p></div><div className="camera-view-actions"><Chip className={replay ? 'camera-replay-chip' : streaming ? 'camera-live-chip' : 'camera-waiting-chip'}>{sourceStatus}</Chip>{!roomView && <button ref={demoButton} className="secondary" aria-pressed={demoView} onClick={() => { setDemoView(value => !value); setSettings(false); }}>{demoView ? 'Exit demo view' : 'Demo view'}</button>}{!roomView && <a href="/room">Room view</a>}<button ref={settingsButton} className="secondary camera-settings-toggle" aria-label="Camera settings" aria-expanded={settings} aria-controls="camera-settings" onClick={() => setSettings(value => !value)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 2 3-1 1-3 3-1 1-3-2-2 1-3-3-2-3 1-2-2Z" /><circle cx="12" cy="11" r="3" /></svg></button></div></div><Card className="camera-card">
    <div id="camera-settings" className="camera-settings" hidden={!settings}>
      <h2>Camera settings</h2>
    <div className="camera-controls">
      <label>Camera source<select aria-label="Camera source" value={deviceId} onChange={event => { setDeviceId(event.target.value); setReplay(null); setFilename(null); }} style={{ display: 'block', minHeight: 44, maxWidth: 320 }}>
        <option value="">Default camera</option>{devices.map((device, i) => <option key={device.deviceId || i} value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>)}
      </select></label>
      <label>Replay file<input aria-label="Replay file" type="file" accept="video/*" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        setFilename(file.name); setReplay(URL.createObjectURL(file)); setSelectedTrack(null);
      }} /></label>
      {replay && <button onClick={() => { setReplay(null); setFilename(null); setSelectedTrack(null); }}>Use live camera</button>}
    </div>
    <details className="camera-correction"><summary>Staff identity correction</summary><p>Click a face box, then choose the waiting patient.</p>
      {selectedTrack && <p>Selected {selectedTrack}</p>}
      <div className="actions" style={{ flexWrap: 'wrap' }}>{state?.visits.filter(visit => visit.status === 'waiting').map(visit => <button key={visit.id} disabled={!selectedTrack || saving} onClick={() => void correct(visit.id)}>{visit.name} · #{visit.queueNo}</button>)}</div>
      {!state?.visits.some(visit => visit.status === 'waiting') && <p>No waiting visits.</p>}
      {correctionError && <p role="alert">{correctionError}</p>}
    </details>
      <p className="camera-technical">{vision.models} · {vision.poseStatus}</p>
    </div>
    {requests.length > 0 && <div className="camera-check-request" role="alert"><strong>Check requested</strong> · {requests.map(alert => `${state?.vitals[alert.visitId]?.source === 'replay' ? 'REPLAY · ' : ''}${alert.facts.name} · #${alert.facts.queueNo}: ${alert.reasons[0] ?? 'may need a check'}`).join(' / ')} · May need a check</div>}
    <div className="camera-status"><Chip>{replay ? `REPLAY · ${filename}` : sourceStatus}</Chip><Chip>{vision.stats.count} {vision.stats.count === 1 ? 'person' : 'people'}</Chip><Chip>{vision.poseStatus}</Chip><Chip>Overlay {vision.stats.fps.toFixed(1)} fps</Chip>{privacy && <Chip>Unknown faces blurred</Chip>}{debug && <Chip>Debug · face/body identity + posture counters</Chip>}</div>
    {debug && <section className="camera-debug" aria-label="Camera debug readings">
      <div>fps: {vision.stats.fps.toFixed(1)} · {vision.poseStatus} · {vision.models}</div>
      <div>{vision.memory}</div>
      {vision.debugTracks?.length ? vision.debugTracks.map(line => <pre key={line.split('\n')[0]}>{line}</pre>) :
        <pre>{'No body/face tracked · track: none · visit: unknown · source: none\nreferenceReady: false · slumpSec: 0.0 · headDropSec: 0.0\nfallSuspected: false · velocity: 0.00\nfaceVelocity: 0.00 heights/s · trigger: none · faceBox: unavailable'}</pre>}
    </section>}
    <p className="camera-source-message" role="status">{message}</p>
    <video ref={video} muted playsInline autoPlay className="source-video" aria-label="Camera source video" />
    <div className="camera-stage"><canvas ref={canvas} className="camera-canvas" aria-label="Face detection overlay" onClick={event => {
      const element = canvas.current; if (!element) return;
      const bounds = element.getBoundingClientRect();
      // The demo view letterboxes the canvas; keep face clicks aligned with the displayed image.
      const scale = Math.min(bounds.width / element.width, bounds.height / element.height);
      const insetX = (bounds.width - element.width * scale) / 2, insetY = (bounds.height - element.height * scale) / 2;
      const x = (event.clientX - bounds.left - insetX) / scale, y = (event.clientY - bounds.top - insetY) / scale;
      const track = vision.tracker.current.current(performance.now()).find(item => x >= item.face.box.x && x <= item.face.box.x + item.face.box.w && y >= item.face.box.y && y <= item.face.box.y + item.face.box.h);
      setSelectedTrack(track?.id ?? null); setCorrectionError('');
    }} /></div>
    {vision.error && <p role="alert">{vision.error}</p>}
    <p className="camera-footnote">{streaming ? `Streaming · ${frame.fps.toFixed(1)} fps` : 'Waiting for frames'} · Heart and breathing readings are camera estimates.</p>
  </Card></div>;
  return roomView ? <RoomView call={state?.nowCalling ?? null} connected={connected} alerts={requests} replayVisitIds={state?.visits.filter(v => state.vitals[v.id]?.source === 'replay').map(v => v.id)}>{camera}</RoomView> : camera;
}
