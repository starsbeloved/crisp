import { useRef, useState } from 'react';
import type { CheckInController } from '../controller-types.ts';

/** Presentation for the same answers used by both the voice and tap flows. */
export function Understood({ controller: c }: { controller: CheckInController }) {
  const reason = c.answers.reason || c.answers.reasonChips.join(', ');
  return <section className="checkin-understood" aria-label="What Crisp understood">
    <h2>What Crisp understood</h2><p>Tap an answer to correct it. Your conversation can continue.</p>
    <EditableAnswer label="Name" value={c.name} placeholder="Listening for your name…" maxLength={120} onSave={c.setName} />
    <div className="checkin-understood-field" data-filled={c.face.status === 'saved'}><span>Face scan</span><strong>{c.face.status === 'saved' ? 'Face saved' : c.face.message || 'Not scanned yet'}</strong><button className="understood-face-edit" type="button" disabled={c.step === 'face'} onClick={() => c.goTo('face')}>Review face scan</button></div>
    <EditableAnswer label="Why you’re here" value={reason} placeholder="Listening…" maxLength={4000} multiline onSave={value => c.setAnswers({ reason: value })} />
    <div className="checkin-understood-field" data-filled={Boolean(c.answers.onset)}><span id="understood-onset">When it started</span><div className="checkin-understood-chips" role="group" aria-labelledby="understood-onset">{([['<1h', 'Under 1 hour'], ['today', 'Today'], ['1-3d', '1–3 days'], ['longer', 'Longer']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={c.answers.onset === value} onClick={() => c.setAnswers({ onset: value })}>{label}</button>)}</div></div>
    <div className="checkin-understood-field" data-filled={Boolean(c.answers.trend)}><span id="understood-trend">How it’s changed</span><div className="checkin-understood-chips" role="group" aria-labelledby="understood-trend">{([['worse', 'Getting worse'], ['same', 'About the same'], ['better', 'Getting better']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={c.answers.trend === value} onClick={() => c.setAnswers({ trend: value })}>{label}</button>)}</div></div>
    <div className="checkin-understood-next">{c.answers.followUp?.answer || 'One follow-up question from Crisp — next'}</div>
  </section>;
}

function EditableAnswer({ label, value, placeholder, maxLength, multiline = false, onSave }: { label: string; value: string; placeholder: string; maxLength: number; multiline?: boolean; onSave: (value: string) => void }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setEditing(false); requestAnimationFrame(() => trigger.current?.focus()); }
  return <div className="checkin-understood-field" data-filled={Boolean(value.trim())}>
    {editing ? <form className="understood-editor" onSubmit={event => { event.preventDefault(); if (draft.trim()) { onSave(draft.trim()); close(); } }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <label>{label}{multiline ? <textarea autoFocus rows={3} required maxLength={maxLength} value={draft} onChange={event => setDraft(event.target.value)} /> : <input autoFocus required maxLength={maxLength} autoComplete="given-name" value={draft} onChange={event => setDraft(event.target.value)} />}</label>
      <div className="understood-edit-actions"><button type="submit" disabled={!draft.trim()}>Save</button><button type="button" onClick={close}>Cancel</button></div>
    </form> : <button ref={trigger} type="button" className="understood-edit-trigger" aria-label={`Edit ${label}`} onClick={() => { setDraft(value); setEditing(true); }}><span>{label}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z" /></svg></span><strong>{value.trim() || placeholder}</strong></button>}
  </div>;
}
