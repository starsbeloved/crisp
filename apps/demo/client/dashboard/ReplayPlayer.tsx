import { useEffect, useState } from 'react';
import type { Alert, Vitals } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { VitalsChart } from './VitalsChart.tsx';

export function ReplayPlayer({ alert, vitals, synthetic = false }: { alert: Alert; vitals?: Vitals; synthetic?: boolean }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFrame(0); setFailed(false); setPlaying(false); }, [alert.id]);
  useEffect(() => {
    if (!playing || !alert.replayFrames) return;
    const timer = setInterval(() => setFrame(i => (i + 1) % alert.replayFrames), 200);
    return () => clearInterval(timer);
  }, [playing, alert.replayFrames]);
  if (alert.replayFrames <= 0) return null;
  const history = vitals?.history.filter(p => p.t >= alert.openedAt - 15_000 && p.t <= alert.openedAt) ?? [];
  const image = synthetic ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#182e25"/><text x="20" y="35" fill="white" font-size="18">SYNTHETIC REPLAY · frame ${frame + 1}</text><rect x="180" y="${60 + frame / 3}" width="100" height="120" rx="16" stroke="#f18b79" fill="none" stroke-width="4"/><text x="20" y="220" fill="white">Illustration only · no patient footage</text></svg>`)}` : api.replayUrl(alert.id, frame);
  return <section className="replay-player"><h4>Replay — 15 s before the request</h4>
    <small>{synthetic ? 'SYNTHETIC · ' : ''}{alert.replayFrames} recorded frames · 5 fps</small>
    {failed ? <p>Replay unavailable.</p> : <img src={image} alt={`${synthetic ? 'SYNTHETIC ' : ''}Replay frame ${frame + 1} of ${alert.replayFrames}`} onError={() => { setFailed(true); setPlaying(false); }} />}
    <button className="secondary" disabled={failed} onClick={() => setPlaying(!playing)}>{playing ? 'Pause replay' : 'Play replay'}</button>
    {history.length > 0 && <VitalsChart history={history} baselineHr={vitals?.baselineHr ?? null} baselineRr={null} compact />}
  </section>;
}
