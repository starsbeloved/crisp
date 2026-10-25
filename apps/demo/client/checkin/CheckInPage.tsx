import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Onset, Trend } from '../../shared/types.ts';
import { Button } from '../ui/Button.tsx';
import { Crisp } from '../ui/Crisp.tsx';
import { CrispAgent } from './agent/CrispAgent.tsx';
import { CheckInContext, type Step } from './controller-types.ts';
import { useCheckIn } from './controller.ts';
import './checkin.css';

const reasons = ['chest pain', 'trouble breathing', 'dizziness or fainting', 'headache', 'fever', 'stomach pain', 'injury', 'nausea', 'allergic reaction', 'other'];
const onsets: Array<[Onset, string]> = [['<1h', 'Less than an hour'], ['today', 'Today'], ['1-3d', '1–3 days'], ['longer', 'Longer']];
const trends: Array<[Trend, string]> = [['worse', 'Getting worse'], ['same', 'About the same'], ['better', 'Getting better']];
const steps: Step[] = ['welcome', 'name', 'face', 'questions', 'followup', 'done'];
const titles: Record<Step, string> = { welcome: "Hi! I’m Crisp.", name: 'What should I call you?', face: 'Look at me for a moment.', questions: 'What brings you in today?', followup: 'One more thing.', done: 'You’re checked in.' };

/** P7's agent mounts inside the same controller provider as the tap flow. */
export function CrispAgentSlot() { return <CrispAgent />; }
export function CheckInPage() {
  const c = useCheckIn();
  const [help, setHelp] = useState(false);
  const [validation, setValidation] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const stepIndex = steps.indexOf(c.step);
  useEffect(() => { setValidation(''); setHelp(false); heading.current?.focus(); }, [c.step]);
  function submit(event: FormEvent) {
    event.preventDefault(); setValidation('');
    if (c.step === 'name') {
      if (!c.name.trim()) { setValidation('Please enter your preferred name or alias.'); return; }
      void c.startFaceScan();
    } else if (c.step === 'questions') {
      if (!c.answers.reason.trim() && !c.answers.reasonChips.length) { setValidation('Please tell Crisp what brings you in, or choose a chip.'); return; }
      if (!c.answers.onset || !c.answers.trend) { setValidation('Please choose when it started and how it has changed.'); return; }
      void c.prepareFollowUp();
    } else if (c.step === 'followup') { void c.finish().catch(() => {}); }
  }
  const reasonText = c.answers.reason || c.answers.reasonChips.join(', ');
  return <CheckInContext.Provider value={c}><section className="checkin" aria-label="Check in with Crisp">
    <div className="checkin-top"><span>CHECK IN WITH CRISP</span><span>{c.step === 'welcome' ? 'Welcome' : c.step === 'done' ? 'All set' : `Step ${stepIndex} of 4`}</span></div>
    <div className="checkin-card">
      <div className="checkin-companion"><Crisp state={c.step === 'done' ? 'happy' : c.face.status === 'scanning' && c.step === 'face' ? 'thinking' : 'idle'} size={c.step === 'welcome' || c.step === 'done' ? 144 : 80} /></div>
      <h1 ref={heading} tabIndex={-1}>{titles[c.step]}</h1>
      {c.step === 'welcome' && <><p>Let’s get you checked in. You can tap your answers and take your time.</p><Button className="checkin-primary" onClick={() => c.goTo('name')}>Start</Button></>}
      {c.step !== 'done' && <div className="checkin-agent"><CrispAgentSlot /></div>}
      <form onSubmit={submit} aria-busy={c.busy}>
        {c.step === 'name' && <><p>Your preferred name or an alias is fine.</p><label htmlFor="checkin-name">Your name</label><input id="checkin-name" name="name" autoComplete="given-name" maxLength={120} value={c.name} onChange={event => c.setName(event.target.value)} aria-describedby={validation ? 'checkin-error' : undefined} /><Button className="checkin-primary" type="submit">Continue</Button></>}
        <div hidden={c.step !== 'face'}>
          {c.step === 'face' && <p>One person at a time. Face the camera in good light. Only a face descriptor is saved, never a photo.</p>}
          <div className="checkin-preview"><video ref={c.videoRef} autoPlay muted playsInline aria-label="Check-in camera preview" /><div className="checkin-oval" aria-hidden="true" />{c.replay && <span className="checkin-replay">REPLAY · {c.replay.split('/').pop()}</span>}</div>
          <div className="checkin-face-status" role="status" aria-live="polite"><span className="checkin-status-chip">{c.face.message}</span><p>{c.cameraMessage}</p></div>
          {c.face.status === 'saved' ? <><Button className="checkin-primary" type="button" onClick={() => c.goTo('questions')}>Continue</Button><Button className="checkin-secondary" type="button" onClick={() => void c.startFaceScan()}>Retake</Button></> : c.face.status !== 'scanning' && <Button className="checkin-primary" type="button" onClick={() => void c.startFaceScan()}>Try face scan again</Button>}
          <Button className="checkin-secondary" type="button" onClick={c.skipFace}>Skip — staff will help</Button>
        </div>
        {c.step === 'questions' && <>
          <label className="checkin-sr-only" htmlFor="checkin-reason">What brings you in today?</label>
          <textarea id="checkin-reason" rows={3} maxLength={4000} value={reasonText} placeholder="Tell me in your own words, or choose below" onChange={event => c.setAnswers({ reason: event.target.value })} />
          <div className="checkin-chips" role="group" aria-label="Common reasons">{reasons.map(reason => <Button type="button" className="checkin-choice" key={reason} aria-pressed={c.answers.reasonChips.includes(reason)} onClick={() => c.setAnswers({ reasonChips: c.answers.reasonChips.includes(reason) ? c.answers.reasonChips.filter(item => item !== reason) : [...c.answers.reasonChips, reason] })}>{reason}</Button>)}</div>
          <fieldset><legend>When did it start?</legend><div className="checkin-chips">{onsets.map(([value, label]) => <Button type="button" className="checkin-choice" key={value} aria-pressed={c.answers.onset === value} onClick={() => c.setAnswers({ onset: value })}>{label}</Button>)}</div></fieldset>
          <fieldset><legend>How has it changed?</legend><div className="checkin-chips">{trends.map(([value, label]) => <Button type="button" className="checkin-choice" key={value} aria-pressed={c.answers.trend === value} onClick={() => c.setAnswers({ trend: value })}>{label}</Button>)}</div></fieldset>
          <Button className="checkin-primary" type="submit">Continue</Button>
        </>}
        {c.step === 'followup' && <>
          <div className="checkin-review"><p><strong>{c.name || 'Your name'}</strong> · {c.face.status === 'saved' ? 'Face saved' : 'Staff can help with your face scan'}</p><p>{reasonText}</p><Button type="button" className="checkin-secondary" onClick={() => c.goTo('questions')} disabled={c.busy}>Edit answers</Button></div>
          {c.followUpLoading ? <p role="status">Crisp is thinking… You can skip this question.</p> : <><label htmlFor="checkin-followup">{c.followUpQuestion || 'Is there anything else you would like the nurse to know?'}</label><textarea id="checkin-followup" rows={2} maxLength={4000} value={c.answers.followUp?.answer ?? ''} onChange={event => c.setFollowUp(c.followUpQuestion || 'Is there anything else you would like the nurse to know?', event.target.value)} disabled={c.busy} /></>}
          <Button className="checkin-primary" type="submit" disabled={c.busy || c.followUpLoading}>{c.busy ? 'Saving check-in…' : c.error ? 'Retry check-in' : 'Finish check-in'}</Button>
          <Button className="checkin-secondary" type="button" disabled={c.busy} onClick={() => { c.setAnswers({ followUp: null }); void c.finish().catch(() => {}); }}>Skip question and check in</Button>
        </>}
      </form>
      {c.step === 'done' && <div role="status"><p>You’re checked in, {c.name.trim()}.</p><p className="checkin-queue">You’re number <strong>{c.queueNo}</strong>.</p><p>Please take a seat. This screen resets in 10 seconds.</p><Button className="checkin-primary" onClick={c.reset}>Check in someone else</Button></div>}
      {(validation || c.error) && <p id="checkin-error" className="checkin-error" role="alert">{validation || c.error}</p>}
      {help && <p className="checkin-help" role="status">Please ask a staff member to help you check in. You can skip the face scan and continue with the form.</p>}
      <div className="checkin-navigation"><Button className="checkin-secondary" type="button" disabled={c.busy || c.step === 'welcome' || c.step === 'done'} onClick={() => c.goTo(steps[Math.max(0, stepIndex - 1)])}>Back</Button><Button className="checkin-secondary" type="button" onClick={() => setHelp(value => !value)} aria-expanded={help}>I need help</Button></div>
    </div>
    <p className="checkin-footer">Prototype — not a medical triage system.</p>
  </section></CheckInContext.Provider>;
}
