import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { RoomState, Visit } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { ReplayPlayer } from './ReplayPlayer.tsx';
import { VitalsChart } from './VitalsChart.tsx';
import { activeAlert, estimate, referenceMae, sourceLabel } from './presentation.ts';
import { CallInPopover } from './CallInPopover.tsx';
import type { QueueActions } from './QueueRow.tsx';

export function PatientDrawer({ visit, state, onClose, synthetic, actions, actionBusy, geminiVision }: { visit: Visit; state: RoomState; onClose: () => void; synthetic: boolean; actions: QueueActions; actionBusy: boolean; geminiVision: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reference, setReference] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [visionHidden, setVisionHidden] = useState(false), [description, setDescription] = useState('');
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current; node?.showModal();
    return () => {
      node?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('#waiting-room-heading')?.focus({ preventScroll: true });
    };
  }, []);
  const vitals = state.vitals[visit.id], alerts = state.alerts.filter(a => a.visitId === visit.id).sort((a, b) => b.openedAt - a.openedAt);
  const request = activeAlert(state, visit.id);
  const latest = alerts[0], note = state.handoffs[visit.id], mae = referenceMae(state, visit.id);
  const stale = !vitals || (synthetic ? state.serverNow : Date.now()) - vitals.lastSeenAt > 5000;
  const canPairReference = !stale && vitals?.hrBpm != null && (vitals.hrQuality === 'good' || vitals.hrQuality === 'fair');
  async function saveReference(event: FormEvent) {
    event.preventDefault(); const n = Number(reference); if (!Number.isFinite(n) || n <= 0 || !canPairReference) return;
    setBusy(true); setMessage('');
    try { await api.reference(visit.id, n); setReference(''); setMessage('Reference saved.'); }
    catch { setMessage('Could not save reference. Try again.'); } finally { setBusy(false); }
  }
  async function vision() {
    if (!latest) return; setBusy(true); setMessage('');
    try { const result = await api.vision(latest.id); setDescription(`${sourceLabel(result.source)} · ${result.description}`); }
    catch (error) { if (error instanceof Error && error.message.includes('501')) { setVisionHidden(true); setMessage('Snapshot description unavailable.'); } else setMessage('Could not describe this snapshot.'); }
    finally { setBusy(false); }
  }
  // History points carry no per-point quality in P0. Hide the affected trace when its current signal is rejected.
  const history = vitals?.history.map(p => ({ ...p, hr: vitals.hrQuality === 'low' || vitals.hrQuality === 'none' ? null : p.hr, rr: vitals.rrQuality === 'low' || vitals.rrQuality === 'none' ? null : p.rr })) ?? [];
  return <dialog ref={dialog} className="patient-drawer" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }} aria-labelledby="patient-title">
    <div className="drawer-header">
      <div className="drawer-heading"><span className={`drawer-number ${request?.level ?? ''}`}>#{visit.queueNo}</span><div><h2 id="patient-title">{visit.name}</h2><p className="drawer-subtitle">Checked in {new Date(visit.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} by {visit.answers.via === 'voice' ? 'voice with Crisp' : 'form'} · {visit.status === 'called' ? `with clinician · ${visit.room}` : 'waiting'}</p></div><button className="secondary drawer-close" aria-label="Close details" onClick={onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      {request && <div className={`drawer-status ${request.level}`}><span>{request.status === 'acknowledged' ? 'Acknowledged' : request.level === 'red' ? 'Check requested' : 'May need a check'}</span><small>{request.reasons.join(' · ')}</small></div>}
      {visit.status === 'waiting' && <div className="drawer-actions">{request && <><button className="secondary" disabled={actionBusy || request.status === 'acknowledged'} onClick={() => actions.acknowledge(request.id)}>{request.status === 'acknowledged' ? 'Acknowledged' : 'Acknowledge'}</button><button disabled={actionBusy} onClick={() => actions.checked(request.id)}>Mark checked</button></>}<CallInPopover busy={actionBusy} onCall={room => actions.call(visit.id, room)} /></div>}
    </div>
    {synthetic && <p className="synthetic-label">SYNTHETIC · illustration only</p>}
    <section><h3>Original check-in</h3><dl><dt>Reason · verbatim</dt><dd>{visit.answers.reason || 'Not provided'}</dd>
      <dt>Selected symptoms</dt><dd>{visit.answers.reasonChips.join(', ') || 'None selected'}</dd><dt>Onset</dt><dd>{visit.answers.onset ?? 'Not provided'}</dd><dt>Trend</dt><dd>{visit.answers.trend ?? 'Not provided'}</dd>
      {visit.answers.followUp && <><dt>{visit.answers.followUp.question}</dt><dd>{visit.answers.followUp.answer}</dd></>}</dl>
      <small>Recorded via {visit.answers.via} · {visit.faceEnrolled ? 'Face enrolled' : 'Face scan skipped'}</small>
      <h3>Check-in summary <span className="tag">{visit.summary ? sourceLabel(visit.summary.source) : 'Pending'}</span></h3><p>{visit.summary?.text ?? 'Summary pending…'}</p>
    </section>
    <section><h3>Camera estimates</h3><p>Heart rate: {estimate(vitals?.hrBpm, vitals?.hrQuality, stale)} · camera estimate<br />Breathing: {estimate(vitals?.rrBpm, vitals?.rrQuality, stale)} · camera estimate</p>
      <p>Signal quality · HR: {vitals?.hrQuality ?? 'none'} · RR: {vitals?.rrQuality ?? 'none'}{vitals?.hint && ` · ${vitals.hint}`}{stale && ' · reading stale'}</p>
      <VitalsChart history={history} baselineHr={vitals?.baselineHr ?? null} baselineRr={vitals?.baselineRr ?? null} />
      <form onSubmit={saveReference}><label htmlFor="reference-hr">Reference HR · bpm</label><div className="ask-input"><input id="reference-hr" type="number" inputMode="numeric" min="1" step="any" required value={reference} onChange={e => setReference(e.target.value)} /><button disabled={busy || synthetic || !canPairReference}>Save reference</button></div></form>
      {!canPairReference && <small>Wait for a current camera estimate with fair or good signal before pairing a reference.</small>}
      <p>Mean absolute error: {mae === null ? 'Awaiting paired reference readings' : `${mae.toFixed(1)} bpm`} · {state.references.filter(r => r.visitId === visit.id && r.cameraBpm !== null).length} paired samples</p>
    </section>
    <section><h3>Request timeline</h3>{!alerts.length && <p>No requests recorded.</p>}{alerts.map(a => <article key={a.id} className={`timeline-event ${a.level}`}><strong>{a.level === 'red' ? 'Red' : 'Amber'} · {a.status}</strong><p>{a.reasons.join(' · ')}</p>
      <small>Opened {new Date(a.openedAt).toLocaleTimeString()}{a.acknowledgedAt && ` · acknowledged ${new Date(a.acknowledgedAt).toLocaleTimeString()}`}{a.checkedAt && ` · checked ${new Date(a.checkedAt).toLocaleTimeString()}`}</small>
      {a.explanation && <p>{a.explanation.bubble} <span className="tag">{sourceLabel(a.explanation.source)}</span></p>}
    </article>)}
      {latest && <ReplayPlayer alert={latest} vitals={vitals} synthetic={synthetic} />}
      {latest && !visionHidden && <><p className="privacy-note">{geminiVision ? 'Gemini sees one alert frame only; it is not stored.' : 'Enable “Gemini sees alert frame” in System to describe one alert snapshot.'}</p><button className="secondary" disabled={busy || synthetic || !geminiVision} onClick={vision}>Describe snapshot (Gemini)</button></>}
      {description && <p><strong>Gemini sees:</strong> {description}</p>}
    </section>
    <section><h3>Clinician handoff {note && <span className="tag">{sourceLabel(note.source)}</span>}</h3><p className="handoff">{note?.text ?? (visit.status === 'called' ? 'Preparing handoff…' : 'Call this person in to prepare a handoff.')}</p>
      {note && <button className="secondary" onClick={() => { void navigator.clipboard.writeText(note.text).then(() => setMessage('Handoff copied.')).catch(() => setMessage('Copy unavailable. Select and copy the note above.')); }}>Copy handoff</button>}
    </section><p role="status">{message}</p>
  </dialog>;
}
