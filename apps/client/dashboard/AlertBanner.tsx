import type { Alert, Visit } from '../../shared/types.ts';
export function AlertBanner({ alert, visit, onAcknowledge, busy }: { alert?: Alert; visit?: Visit; onAcknowledge: (id: string) => void; busy: boolean }) {
  return <section className={`alert-banner ${alert?.level ?? 'clear'}`} aria-live="polite">
    {alert ? <><div className="alert-copy"><strong>{alert.level === 'red' ? 'Check requested' : 'May need a check'} · {visit?.name ?? alert.facts.name} · #{visit?.queueNo ?? alert.facts.queueNo}</strong>
      <p>{alert.reasons.join(' · ') || 'Please check on this person.'} <span className="alert-meta">Raised {Math.max(0, Math.floor((Date.now() - alert.openedAt) / 1000))} s ago · camera estimate</span></p></div>
      <button disabled={busy} onClick={() => onAcknowledge(alert.id)}>Acknowledge</button></> : <div><strong>No open requests</strong><p>Camera estimates support a human check.</p></div>}
  </section>;
}
