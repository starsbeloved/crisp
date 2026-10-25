import { useEffect, useState } from 'react';
import type { CameraStatus } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

export function VideoPanel({ cameras, now }: { cameras: Record<string, CameraStatus>; now: number }) {
  const [direct, setDirect] = useState(false);
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; void api.config().then(c => {
    const url = new URL(location.origin); url.port = String(c.apiPort);
    if (alive) setOrigin(url.origin);
  }).catch(() => {}); return () => { alive = false; }; }, []);
  return <section className="panel video-panel"><div className="section-heading"><h2>Room cameras</h2>
    <button className="secondary" disabled={!origin} aria-pressed={direct} onClick={() => { setDirect(!direct); setError(''); }}>{direct ? 'Use proxy stream' : 'Use direct stream'}</button></div>
    <div className="feeds">{Object.values(cameras).map(c => <figure key={c.cameraId}>
      <figcaption><strong>Camera {c.cameraId}</strong><span className="tag">{c.source === 'replay' ? 'REPLAY' : 'LIVE'}</span>
        {now - c.lastFrameAt > 2000 && <span className="tag warning">STALE</span>}</figcaption>
      <img className="stream" src={`${direct ? origin : ''}${api.streamUrl(c.cameraId)}`} alt={`Camera ${c.cameraId} · ${c.source === 'replay' ? 'REPLAY' : 'LIVE'}`} onError={() => setError('Stream unavailable. Check the camera window or try the direct stream.')} />
    </figure>)}</div>
    {!Object.keys(cameras).length && <div className="empty-camera"><p>Waiting for a camera stream</p><a href="/camera?cam=A" target="_blank" rel="noreferrer">Open room camera →</a><small>Keep the camera window visible for continuous processing.</small></div>}
    {error && <p role="status">{error}</p>}
  </section>;
}
