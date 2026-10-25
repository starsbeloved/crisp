import type { Alert, Visit } from '../../shared/types.ts';
import { sourceLabel } from './presentation.ts';

export function IncidentDebrief({ alert, visit }: { alert: Alert; visit: Visit }) {
  const reported = alert.facts.answers.reason.trim() || alert.facts.chiefComplaint || 'No complaint recorded';
  const camera = alert.reasons.join(' · ') || 'Recorded camera observations may need a check.';
  const staff = alert.status === 'acknowledged' ? 'Staff acknowledged the request.' : alert.status === 'checked' ? 'Staff marked the request checked.' : 'Staff have not acknowledged the request yet.';
  return <section className={`incident-debrief ${alert.level}`} aria-label="Incident debrief">
    <div className="incident-debrief-heading"><div><p className="eyebrow">Crisp · recorded facts</p><h2>Incident debrief · {visit.name}</h2></div><span className="tag">{sourceLabel(alert.explanation?.source ?? 'template')}</span></div>
    <p className="incident-debrief-lead">{alert.explanation?.bubble ?? 'Crisp is summarizing the recorded request…'}</p>
    <dl><div><dt>Camera saw</dt><dd>{camera}</dd></div><div><dt>Patient reported</dt><dd>{reported}</dd></div><div><dt>Staff action</dt><dd>{staff}</dd></div></dl>
    <p className="incident-debrief-next">Suggested next step: a human check</p>
  </section>;
}
