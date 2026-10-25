import { useEffect, useState } from 'react';
import type { CameraStatus } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

export function VideoPanel({ cameras, now }: { cameras: Record<string, CameraStatus>; now: number }) {
  const [direct, setDirect] = useState(false);
  const [cameraView, setCameraView] = useState<'A' | 'B' | 'both'>('both');
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; void api.config().then(c => {
    const url = new URL(location.origin); url.port = String(c.apiPort);
    if (alive) setOrigin(url.origin);
  }).catch(() => {}); return () => { alive = false; }; }, []);
  const shownCameras = Object.values(cameras).filter(camera => cameraView === 'both' || camera.cameraId === cameraView);
  return <section className="panel video-panel"><div className="section-heading"><h2>Room camera</h2>
    <div className="camera-segments" role="group" aria-label="Camera view">{(['A', 'B', 'both'] as const).map(view => <button key={view} type="button" aria-pressed={cameraView === view} onClick={() => { setCameraView(view); setError(''); }}>{view === 'both' ? 'Both' : `Cam ${view}`}</button>)}</div></div>
    <div className={`feeds${shownCameras.length > 1 ? ' feeds-multiple' : ''}`}>{shownCameras.map(c => <figure key={c.cameraId}>
      <figcaption><strong>Camera {c.cameraId}</strong><span className="tag">{c.source === 'replay' ? 'REPLAY' : 'LIVE'}</span>
        {now - c.lastFrameAt > 2000 && <span className="tag warning">STALE</span>}<span className="video-meta">{c.fps.toFixed(0)} fps · frame {Math.max(0, (now - c.lastFrameAt) / 1000).toFixed(1)} s ago</span></figcaption>
      <img className="stream" src={`${direct ? origin : ''}${api.streamUrl(c.cameraId)}`} alt={`Camera ${c.cameraId} · ${c.source === 'replay' ? 'REPLAY' : 'LIVE'}`} onError={() => setError('Stream unavailable. Check the camera window or try the direct stream.')} />
    </figure>)}</div>
    {!shownCameras.length && <div className="empty-camera"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="3" /><path d="m16 10 5-3v10l-5-3" /></svg><p>{cameraView === 'both' ? 'Your room view starts here' : `Camera ${cameraView} is ready to connect`}</p><a href={`/camera?cam=${cameraView === 'both' ? 'A' : cameraView}`} target="_blank" rel="noreferrer">Open room camera <span aria-hidden="true">↗</span></a><small>Keep the camera window visible for continuous processing.</small></div>}
    {shownCameras.length > 0 && <p className="privacy-note">Unknown faces blurred · no images stored</p>}
    <details className="stream-options"><summary>Stream options</summary><button className="secondary" disabled={!origin} aria-pressed={direct} onClick={() => { setDirect(!direct); setError(''); }}>{direct ? 'Use proxy stream' : 'Use direct stream'}</button></details>
    {error && <p role="status">{error}</p>}
  </section>;
}
