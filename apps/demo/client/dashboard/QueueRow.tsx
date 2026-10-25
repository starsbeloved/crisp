import type { Alert, Visit, Vitals } from '../../shared/types.ts';
import { CallInPopover } from './CallInPopover.tsx';
import { CrispBubble } from './CrispBubble.tsx';
import { PulseWave } from './PulseWave.tsx';
import { estimate, postureLabel } from './presentation.ts';
export interface QueueActions { acknowledge: (id: string) => void; checked: (id: string) => void; call: (id: string, room: string) => void }
export function QueueRow({ visit, vitals, alert, now, onSelect, actions, busy, talking, synthetic }: {
  visit: Visit; vitals?: Vitals; alert?: Alert; now: number; onSelect: () => void; actions: QueueActions; busy: boolean; talking: boolean; synthetic: boolean;
}) {
  const stale = !vitals || now - vitals.lastSeenAt > 5000;
  const hr = estimate(vitals?.hrBpm, vitals?.hrQuality, stale), rr = estimate(vitals?.rrBpm, vitals?.rrQuality, stale);
  const valid = !stale && (vitals?.hrQuality === 'good' || vitals?.hrQuality === 'fair') && vitals?.hrBpm != null;
  const signal = stale ? 'none' : vitals?.hrQuality === 'good' && vitals.rrQuality === 'good' ? 'good' : vitals?.hrQuality === 'fair' || vitals?.rrQuality === 'fair' ? 'fair' : 'low';
  const signalLabel = signal === 'good' ? 'Good signal' : signal === 'fair' ? 'Fair signal' : signal === 'low' ? 'Low signal' : 'Measuring…';
  return <article className={`queue-row ${alert?.level ?? 'none'} ${alert?.status ?? ''}`} data-visit-id={visit.id}>
    <button className="patient-select" onClick={onSelect} aria-label={`Open details for ${visit.name}`}><span className="queue-number">#{visit.queueNo}</span><strong>{visit.name}</strong><span>{Math.max(0, Math.floor((now - visit.createdAt) / 60_000))} min</span></button>
    <div className="row-chips"><span className="tag complaint">{visit.summary?.chiefComplaint ?? visit.answers.reason ?? 'Check-in pending'}</span>
      {alert && <span className={`tag ${alert.level}`}>{alert.status === 'acknowledged' ? 'Acknowledged' : `${alert.level === 'red' ? 'Red' : 'Amber'} · may need a check`}</span>}
      {vitals?.source === 'replay' && <span className="tag">REPLAY</span>}
      {!visit.faceEnrolled && <span className="tag">Face scan skipped</span>}
    </div>
    <div className="row-vitals"><div className="vital-cell"><span className={`status ${stale ? 'low' : vitals?.hrQuality ?? 'none'}`}>HR · {hr}{Number.isFinite(Number(hr)) ? ' bpm' : ''}</span><small>camera estimate</small><PulseWave trace={valid ? vitals?.pulseTrace : null} bpm={valid ? vitals!.hrBpm : null} /></div>
      <div className="vital-cell"><span className={`status ${stale ? 'low' : vitals?.rrQuality ?? 'none'}`}>RR · {rr}{Number.isFinite(Number(rr)) ? '/min' : ''}</span><small>camera estimate</small></div>
      <div className="vital-cell"><span className={`posture ${alert?.level ?? ''}`}>{stale ? 'Measuring…' : postureLabel(vitals)}</span><small>{!stale && vitals?.hint ? vitals.hint : 'posture · camera estimate'}</small></div>
      <div className="vital-cell"><span className={`signal-bars ${signal}`} aria-label={signalLabel}><i /><i /><i /></span><small>{signalLabel}</small></div></div>
    <div className="row-actions">{alert?.status === 'open' && <button className="secondary" disabled={busy} onClick={() => actions.acknowledge(alert.id)}>Acknowledge</button>}
      {alert && <button className="secondary" disabled={busy} onClick={() => actions.checked(alert.id)}>Mark checked</button>}
      <CallInPopover busy={busy} onCall={room => actions.call(visit.id, room)} />
    </div>
    {alert && <CrispBubble key={alert.id} alert={alert} vitals={vitals} talking={talking} synthetic={synthetic} />}
  </article>;
}
