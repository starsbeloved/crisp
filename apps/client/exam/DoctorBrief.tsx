import { useEffect, useState } from 'react';
import type { RoomState, ProviderSource, Visit } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { doctorBriefPrompt, doctorBriefTemplate } from '../../server/briefs.ts';

export function DoctorBrief({ visit, state }: { visit: Visit; state: RoomState }) {
  const [brief, setBrief] = useState<{ answer: string; source: ProviderSource }>({ answer: doctorBriefTemplate(visit, state), source: 'template' });
  const timelineKey = state.alerts.filter(alert => alert.visitId === visit.id).map(alert => `${alert.id}:${alert.status}:${alert.updatedAt}`).join('|');
  useEffect(() => {
    let active = true;
    setBrief({ answer: doctorBriefTemplate(visit, state), source: 'template' });
    void api.ask(doctorBriefPrompt(visit, state)).then(result => {
      if (active && typeof result.answer === 'string' && (result.source === 'gemini' || result.source === 'template')) setBrief(result);
    }).catch(() => { /* Keep the recorded-facts template visible. */ });
    return () => { active = false; };
  }, [visit.id, timelineKey]);
  return <section className="exam-section exam-doctor-brief" aria-label="Doctor pre-visit brief">
    <div className="exam-brief-heading"><div><p className="exam-eyebrow">Crisp · clinician handoff</p><h2>Doctor pre-visit brief</h2></div><span className="exam-tag">{brief.source === 'gemini' ? '✦ Gemini' : 'Template'}</span></div>
    <span className="exam-demo-label">Demo records — fictional</span>
    <p className="exam-brief-copy">{brief.answer}</p>
    <p className="exam-muted">Three lines from today’s words and the waiting-room timeline. Review the recorded chart with the patient.</p>
  </section>;
}
