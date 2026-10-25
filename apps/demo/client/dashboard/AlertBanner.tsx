import type { Alert, Visit } from '../../shared/types.ts';
export function AlertBanner({ alert, visit, onAcknowledge, busy }: { alert?: Alert; visit?: Visit; onAcknowledge: (id: string) => void; busy: boolean }) {
  return <section className={`alert-banner ${alert?.level ?? 'clear'}`} aria-live="polite">
    {alert ? <><div><strong>May need a check · {visit?.name ?? alert.facts.name} · #{visit?.queueNo ?? alert.facts.queueNo}</strong>
      <p>{alert.reasons[0] ?? 'Please check on this person.'}</p></div>
      <button disabled={busy} onClick={() => onAcknowledge(alert.id)}>Acknowledge</button></> : <div><strong>No open requests</strong><p>Camera estimates support a human check.</p></div>}
  </section>;
}
