import { useState } from 'react';
import { Button } from '../../ui/Button.tsx';
import type { KioskPulseView } from '../pulse.ts';

export function PulseCheck({ view, skip, complete, replay }: {
  view: KioskPulseView | null; skip(): void; complete(): void; replay: boolean;
}) {
  const [reference, setReference] = useState('');
  const [comparison, setComparison] = useState('');
  const reading = view?.reading;
  const usable = reading?.hrBpm != null && ['good', 'fair'].includes(reading.hrQuality);
  const label = usable ? `${Math.round(reading.hrBpm!)} bpm · ${reading.hrQuality} · camera estimate` : 'Measuring…';
  const hint = reading?.hint === 'too dark' ? 'More light, please' : reading?.hint === 'move closer' ? 'Move a little closer' :
    reading?.hint === 'hold still' ? 'Hold still' : !reading?.hrSecondsCollected ? 'Keep one face in view' : null;
  const trace = reading?.pulseTrace;
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const remaining = view?.secondsLeft ?? 15;
  return <section className="checkin-pulse" aria-label="Pulse check">
    <div className="checkin-pulse-summary">
      <div className="checkin-pulse-clock" role="timer" aria-label={`${remaining} seconds remaining`}>
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="44" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - remaining / 15)} /></svg>
        <span>{remaining > 0 ? `${remaining}s` : usable ? '✓' : '…'}</span>
      </div>
      <div><h2>Pulse check</h2><p>Hold still for a moment — I’m checking your pulse.</p><p className="checkin-pulse-value" role="status" aria-live="polite">{label}</p></div>
    </div>
    <svg className="checkin-pulse-wave" viewBox="0 0 360 80" role="img" aria-label={trace ? 'Measured camera pulse waveform' : 'Waiting for a clear pulse signal'}>
      {trace && <polyline points={trace.map((value, i) => `${i * 360 / (trace.length - 1)},${40 - value * 30}`).join(' ')} />}
    </svg>
    {hint && <p className="checkin-status-chip">{hint}</p>}
    <p>{remaining ? 'About 15 seconds. Stay comfortably still, about 50 cm from the camera.' : usable ? 'Camera estimate captured. You can continue.' : 'A few more seconds… We’ll continue by 25 seconds.'}</p>
    {replay && <p><strong>REPLAY · camera estimate from a recording</strong></p>}
    <div className="checkin-pulse-actions">{usable && <Button type="button" className="checkin-primary" onClick={complete}>Continue</Button>}<Button type="button" className="checkin-secondary" onClick={skip}>Skip</Button></div>
    {debug && <details className="checkin-pulse-debug" open><summary>Pulse signal details</summary>
      <p>Quality: {reading?.hrQuality ?? 'none'} · SNR (peak/band power): {reading?.hrSnr?.toFixed(2) ?? '—'} · fps: {view?.fps.toFixed(1) ?? '0.0'}</p>
      <label htmlFor="pulse-reference">Reference HR<input id="pulse-reference" type="number" min="30" max="240" inputMode="numeric" value={reference} onChange={event => { setReference(event.target.value); setComparison(''); }} /></label>
      <Button type="button" disabled={!usable || !reference || Number(reference) < 30 || Number(reference) > 240} onClick={() => {
        const delta = reading!.hrBpm! - Number(reference);
        const text = `Camera − reference: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} bpm`;
        setComparison(text);
        console.info('Kiosk reference comparison (local only)', { cameraBpm: reading!.hrBpm, referenceBpm: Number(reference), differenceBpm: delta });
      }}>Compare locally</Button><p role="status">{comparison || 'Reference stays in this browser; it is not sent to providers.'}</p>
    </details>}
  </section>;
}
