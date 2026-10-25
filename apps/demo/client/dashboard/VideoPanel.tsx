import { useEffect, useState } from 'react';
import type { CameraStatus } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

export function VideoPanel({ cameras, now }: { cameras: Record<string, CameraStatus>; now: number }) {
  const [direct, setDirect] = useState(true);
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; void api.config().then(c => {
    const url = new URL(location.origin); url.port = String(c.apiPort);
    if (alive) setOrigin(url.origin);
  }).catch(() => {}); return () => { alive = false; }; }, []);
  const activeCameras = Object.values(cameras).filter(camera => now - camera.lastFrameAt < 60_000 && camera.cameraId.toLowerCase() !== 'synthetic');
  return <section className="panel video-panel"><div className="section-heading"><h2>Room camera</h2></div>
    <div className={`feeds${activeCameras.length > 1 ? ' feeds-multiple' : ''}`}>{activeCameras.map(c => <figure key={c.cameraId}>
      <figcaption><strong>Camera {c.cameraId}</strong><span className="tag">{c.source === 'replay' ? 'REPLAY' : 'LIVE'}</span>
        {now - c.lastFrameAt > 2000 && <span className="tag warning">STALE</span>}<span className="video-meta">{c.fps.toFixed(0)} fps · frame {Math.max(0, (now - c.lastFrameAt) / 1000).toFixed(1)} s ago</span></figcaption>
      <img className="stream" src={`${direct ? origin : ''}${api.streamUrl(c.cameraId)}`} alt={`Camera ${c.cameraId} · ${c.source === 'replay' ? 'REPLAY' : 'LIVE'}`} onError={() => setError('Stream unavailable. Check the camera window or try the direct stream.')} />
    </figure>)}</div>
    {!activeCameras.length && <div className="empty-camera"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="3" /><path d="m16 10 5-3v10l-5-3" /></svg><p>Your room view starts here</p><a href="/room">Open the Room view on the camera computer <span aria-hidden="true">↗</span></a><small>Keep the camera window visible for continuous processing.</small></div>}
    {activeCameras.length > 0 && <p className="privacy-note">Unknown faces blurred · no images stored</p>}
    <details className="stream-options"><summary>Stream options</summary><button className="secondary" disabled={!origin} aria-pressed={direct} onClick={() => { setDirect(!direct); setError(''); }}>{direct ? 'Use proxy stream' : 'Use direct stream'}</button></details>
    {error && <p role="status">{error}</p>}
  </section>;
}
