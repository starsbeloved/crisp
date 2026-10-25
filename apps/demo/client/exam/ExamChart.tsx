import type { DemoRecord } from '../../server/records.ts';
import type { RoomState, Visit } from '../../shared/types.ts';
import { ageFromDob, cameraEstimate, RECORDS_LABEL } from './model.ts';

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const source = (value: 'gemini' | 'template') => value === 'gemini' ? 'Gemini' : 'Template';
export function ExamChart({ visit, state, record, recordStatus, connected }: {
  visit: Visit; state: RoomState; record: DemoRecord | null; recordStatus: 'loading' | 'ready' | 'error'; connected: boolean;
}) {
  const vitals = state.vitals[visit.id];
  const stale = !connected || !vitals || state.serverNow - vitals.lastSeenAt > 5000;
  const age = ageFromDob(visit.answers.dateOfBirth, new Date(state.serverNow));
  const handoff = state.handoffs[visit.id];
  const rejectedHandoff = Boolean(handoff && /\b(?:heart rate|breathing|HR|RR)[^\n;]*\b\d+(?:\.\d+)?[^\n;]*\b(?:low|none)\b/i.test(handoff.text));
  const handoffText = rejectedHandoff ? [
    `Situation: ${visit.name}, number ${visit.queueNo}, called to ${visit.room}.`,
    `Background: ${visit.answers.reason}${visit.answers.followUp ? `\n${visit.answers.followUp.question} ${visit.answers.followUp.answer}` : ''}`,
    'Assessment: See the recorded request timeline above. Camera values with low signal are omitted.',
    'Request: Review the recorded facts with the patient.',
  ].join('\n') : handoff?.text;
  const events: { key: string; at: number; title: string; text: string }[] = [];
  for (const alert of state.alerts.filter(item => item.visitId === visit.id)) {
    events.push({ key: `${alert.id}:opened`, at: alert.openedAt, title: `${alert.level === 'red' ? 'Red' : 'Amber'} · may need a check`, text: alert.reasons.join(' · ') });
    if (alert.acknowledgedAt !== null) events.push({ key: `${alert.id}:ack`, at: alert.acknowledgedAt, title: 'Nurse acknowledged request', text: '' });
    if (alert.checkedAt !== null) events.push({ key: `${alert.id}:checked`, at: alert.checkedAt, title: 'Nurse marked checked', text: '' });
  }
  if (visit.calledAt !== null) events.push({ key: 'called', at: visit.calledAt, title: `Called to ${visit.room?.match(/^room/i) ? visit.room : `Room ${visit.room}`}`, text: '' });
  if (vitals) events.push({ key: 'camera', at: vitals.lastSeenAt, title: `Camera estimates · ${vitals.source === 'replay' ? 'REPLAY' : 'LIVE'}`, text: `Heart rate: ${cameraEstimate(vitals.hrBpm, vitals.hrQuality, stale, 'bpm')} · Breathing: ${cameraEstimate(vitals.rrBpm, vitals.rrQuality, stale, '/min')} · HR quality: ${vitals.hrQuality} · Breathing quality: ${vitals.rrQuality}${vitals.hint ? ` · ${vitals.hint}` : ''}` });
  events.sort((a, b) => a.at - b.at);
  return <article className="exam-chart" aria-label={`${visit.name}'s read-only chart`}>
    <div className="exam-patient">
      <div><p className="exam-eyebrow">Patient chart · read only</p><h1>{visit.name}</h1><p>DOB {visit.answers.dateOfBirth || 'Not provided'} · {age === null ? 'Age not available' : `${age} years`}<br />Phone {visit.answers.phone || 'Not provided'}</p></div>
      <div className="exam-queue"><strong>#{visit.queueNo}</strong><span>Waited {Math.max(0, Math.floor(((visit.calledAt ?? state.serverNow) - visit.createdAt) / 60000))} min</span></div>
    </div>
    <div className="exam-chart-columns">
      <div className="exam-chart-main">
        <section className="exam-section"><h2>Today</h2><p className="exam-eyebrow">Their own words · {visit.answers.via === 'voice' ? 'voice check-in' : 'tap check-in'}</p>
          <blockquote>{visit.answers.reason || 'Not provided'}</blockquote>
          <dl className="exam-facts"><div><dt>Onset</dt><dd>{visit.answers.onset ?? 'Not provided'}</dd></div><div><dt>Trend</dt><dd>{visit.answers.trend ?? 'Not provided'}</dd></div></dl>
          {visit.answers.reasonChips.length > 0 && <p>Selected symptoms: {visit.answers.reasonChips.join(', ')}</p>}
          {visit.answers.followUp && <div className="exam-followup"><h3>{visit.answers.followUp.question}</h3><p>{visit.answers.followUp.answer || 'No answer recorded'}</p></div>}
          <h3>Check-in summary <span className="exam-tag">{visit.summary ? source(visit.summary.source) : 'Pending'}</span></h3><p>{visit.summary?.text ?? 'Summary pending…'}</p>
        </section>
        <section className="exam-section"><h2>Waiting room {vitals?.source === 'replay' && <span className="exam-tag">REPLAY</span>}</h2>
          <p className="exam-muted">Camera estimates; requests for a human check. Historical request source and signal quality are not retained.</p>
          <ol className="exam-timeline">{events.map(event => <li key={event.key}><time dateTime={new Date(event.at).toISOString()}>{time(event.at)}</time><div><strong>{event.title}</strong>{event.text && <p>{event.text}</p>}</div></li>)}</ol>
          {!vitals && <p>No camera estimates recorded.</p>}
          <h3>SBAR handoff {handoff && <span className="exam-tag">{rejectedHandoff ? 'Template · exam view' : source(handoff.source)}</span>}</h3><p className="exam-handoff">{handoffText ?? 'Handoff pending…'}</p>
        </section>
      </div>
      <section className="exam-section exam-history"><p className="exam-eyebrow">History</p><h2>Prior record</h2><span className="exam-demo-label">{RECORDS_LABEL}</span>
        {recordStatus === 'loading' ? <p role="status">Retrieving record…</p> : recordStatus === 'error' ? <p role="alert">Record unavailable. Retry the record lookup.</p> : !record ? <p>No prior record found</p> : <>
          <p className="exam-muted">Matched by exact name + date of birth.</p>
          <div className="exam-allergies"><h3>Recorded allergies</h3><RecordList items={record.allergies} /></div>
          <h3>Medications</h3><RecordList items={record.medications} />
          <h3>Problem list · recorded</h3><RecordList items={record.problems} />
          <h3>Past visits</h3><ul className="exam-record-list">{record.pastVisits.map((item, i) => <li key={i}><time>{item.date}</time><p>{item.note}</p></li>)}</ul>
          <h3>Last recorded vitals</h3><p className="exam-muted">Fictional history · {record.lastVitals.date}</p>
          <dl className="exam-facts"><div><dt>Heart rate</dt><dd>{record.lastVitals.heartRate} bpm</dd></div><div><dt>Breathing</dt><dd>{record.lastVitals.respiratoryRate} /min</dd></div><div><dt>Blood pressure</dt><dd>{record.lastVitals.bloodPressure} mmHg</dd></div></dl>
        </>}
      </section>
    </div>
  </article>;
}
function RecordList({ items }: { items: string[] }) { return items.length ? <ul className="exam-record-list">{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>None recorded</p>; }
