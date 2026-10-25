import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Onset, Trend } from '../../shared/types.ts';
import { Button } from '../ui/Button.tsx';
import { Crisp } from '../ui/Crisp.tsx';
import { CrispAgent } from './agent/CrispAgent.tsx';
import { CheckInContext, type Step } from './controller-types.ts';
import { useCheckIn } from './controller.ts';
import { FaceGuide } from './ui/FaceGuide.tsx';
import { KioskIcon } from './ui/KioskIcon.tsx';
import { KioskProgress } from './ui/KioskProgress.tsx';
import { ResetCountdown } from './ui/ResetCountdown.tsx';
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
  return <CheckInContext.Provider value={c}><section className="checkin" data-step={c.step} aria-label="Check in with Crisp">
    <div className="checkin-top"><div className="checkin-brand"><KioskIcon name="apple" /><span>{c.step === 'welcome' ? 'Crisp check-in' : c.step === 'done' ? 'All done' : c.step === 'face' ? 'Face scan' : c.step === 'questions' ? 'Three quick questions' : c.step === 'followup' ? 'One more thing' : 'Your name'}</span></div><div className="checkin-navigation"><Button className="checkin-secondary" type="button" disabled={c.busy || c.step === 'welcome' || c.step === 'done'} onClick={() => c.goTo(steps[Math.max(0, stepIndex - 1)])}>Back</Button><Button className="checkin-secondary" type="button" onClick={() => setHelp(value => !value)} aria-expanded={help}>I need help</Button></div><KioskProgress step={c.step} /></div>
    <div className="checkin-card">
      <div className="checkin-intro-group"><div className="checkin-companion"><Crisp state={c.step === 'welcome' || c.step === 'done' ? 'happy' : c.face.status === 'scanning' && c.step === 'face' ? 'thinking' : 'idle'} size={c.step === 'welcome' ? 480 : c.step === 'done' ? 440 : c.step === 'face' ? 170 : 110} /></div>
      <div className="checkin-intro">
        {c.step === 'done' && <p className="checkin-done-greeting">You’re checked in, {c.name.trim()}.</p>}
        <h1 ref={heading} tabIndex={-1}>{c.step === 'done' ? 'You’re number' : titles[c.step]}</h1>
        {c.step === 'welcome' && <p className="checkin-welcome-copy">Let’s get you checked in. It takes about a minute.</p>}
        {c.step === 'name' && <p>Your preferred name or an alias is fine.</p>}
        {c.step === 'face' && <p>Look at me for a second! Keep your face inside the oval.</p>}
        {c.step === 'questions' && <p>Tap or type — whatever is easier.</p>}
      </div>
      </div>
      {c.step !== 'done' && <div className="checkin-agent"><CrispAgentSlot /></div>}
      {c.step === 'welcome' && <div className="checkin-welcome-actions"><Button className="checkin-primary checkin-start" onClick={() => c.goTo('name')}>Start</Button><ol className="checkin-how"><li>Tell Crisp your name</li><li>Look at the camera for two seconds</li><li>Say what brings you in, in your own words</li></ol></div>}
      <form className="checkin-form" onSubmit={submit} aria-busy={c.busy}>
        {c.step === 'name' && <div className="checkin-name-panel"><label htmlFor="checkin-name">Your name</label><input id="checkin-name" name="name" autoComplete="given-name" maxLength={120} value={c.name} onChange={event => c.setName(event.target.value)} aria-describedby={validation ? 'checkin-error' : undefined} /><Button className="checkin-primary" type="submit">Continue</Button></div>}
        <div className="checkin-face-layout" hidden={c.step !== 'face'}>
          <div className="checkin-preview"><video ref={c.videoRef} autoPlay muted playsInline aria-label="Check-in camera preview" /><FaceGuide message={c.face.message} saved={c.face.status === 'saved'} /><div className="checkin-face-status" role="status" aria-live="polite"><span className="checkin-status-chip" data-saved={c.face.status === 'saved'}>{c.face.message}</span></div>{c.replay && <span className="checkin-replay">REPLAY · {c.replay.split('/').pop()}</span>}<span className="checkin-photo-note">Face pattern only — no photo is stored</span></div>
          <aside className="checkin-face-aside">
            <p className="checkin-face-instruction">One person at a time. Face the camera in good light. Only a face descriptor is saved, never a photo.</p>
            <p className="checkin-camera-message">{c.cameraMessage}</p>
            <div className="checkin-scan-hints"><p>What the scan may tell you</p><div><span>Looking for your face…</span><span>Move a little closer</span><span>Only one person, please</span><span>More light, please</span>{c.face.status === 'saved' && <span className="is-saved">✓ Face saved</span>}</div></div>
            <div className="checkin-scan-actions">{c.face.status === 'saved' ? <><Button className="checkin-primary" type="button" onClick={() => c.goTo('questions')}>Continue</Button><Button className="checkin-secondary" type="button" onClick={() => void c.startFaceScan()}>Retake</Button></> : c.face.status !== 'scanning' && <Button className="checkin-primary" type="button" onClick={() => void c.startFaceScan()}>Try face scan again</Button>}
            <Button className="checkin-secondary checkin-skip" type="button" onClick={c.skipFace}>Skip — staff will help</Button></div>
          </aside>
        </div>
        {c.step === 'questions' && <>
          <section className="checkin-question-panel"><label className="checkin-question-title" htmlFor="checkin-reason">1. What brings you in today?</label>
          <textarea id="checkin-reason" rows={3} maxLength={4000} value={reasonText} placeholder="Tell me in your own words, or choose below" onChange={event => c.setAnswers({ reason: event.target.value })} />
          <div className="checkin-chips checkin-reasons" role="group" aria-label="Common reasons">{reasons.map(reason => <Button type="button" className="checkin-choice" key={reason} aria-pressed={c.answers.reasonChips.includes(reason)} onClick={() => c.setAnswers({ reasonChips: c.answers.reasonChips.includes(reason) ? c.answers.reasonChips.filter(item => item !== reason) : [...c.answers.reasonChips, reason] })}>{reason}</Button>)}</div></section>
          <fieldset className="checkin-question-panel"><legend>When did it start?</legend><div className="checkin-question-title" aria-hidden="true">2. When did it start?</div><div className="checkin-chips checkin-onsets">{onsets.map(([value, label]) => <Button type="button" className="checkin-choice" key={value} aria-pressed={c.answers.onset === value} onClick={() => c.setAnswers({ onset: value })}>{label}</Button>)}</div></fieldset>
          <fieldset className="checkin-question-panel"><legend>How has it changed?</legend><div className="checkin-question-title" aria-hidden="true">3. How has it changed?</div><div className="checkin-chips checkin-trends">{trends.map(([value, label]) => <Button type="button" className="checkin-choice" key={value} aria-pressed={c.answers.trend === value} onClick={() => c.setAnswers({ trend: value })}>{label}</Button>)}</div></fieldset>
          <div className="checkin-form-submit"><p>Your own words are kept exactly as you wrote them.</p><Button className="checkin-primary" type="submit">Continue</Button></div>
        </>}
        {c.step === 'followup' && <section className="checkin-followup-panel">
          <div className="checkin-review"><p><strong>{c.name || 'Your name'}</strong> · {c.face.status === 'saved' ? 'Face saved' : 'Staff can help with your face scan'}</p><p>{reasonText}</p><Button type="button" className="checkin-secondary" onClick={() => c.goTo('questions')} disabled={c.busy}>Edit answers</Button></div>
          {c.followUpLoading ? <p role="status">Crisp is thinking… You can skip this question.</p> : <><label htmlFor="checkin-followup">{c.followUpQuestion || 'Is there anything else you would like the nurse to know?'}</label><textarea id="checkin-followup" rows={2} maxLength={4000} value={c.answers.followUp?.answer ?? ''} onChange={event => c.setFollowUp(c.followUpQuestion || 'Is there anything else you would like the nurse to know?', event.target.value)} disabled={c.busy} /></>}
          <Button className="checkin-primary" type="submit" disabled={c.busy || c.followUpLoading}>{c.busy ? 'Saving check-in…' : c.error ? 'Retry check-in' : 'Finish check-in'}</Button>
          <Button className="checkin-secondary checkin-skip" type="button" disabled={c.busy} onClick={() => { c.setAnswers({ followUp: null }); void c.finish().catch(() => {}); }}>Skip question and check in</Button>
        </section>}
      </form>
      {c.step === 'done' && <div className="checkin-done-content" role="status"><div className="checkin-ticket-row"><strong className="checkin-queue">{c.queueNo}</strong><p>Please take a seat. Crisp will call you by name on the screen when it’s your turn.</p></div><p className="checkin-done-note"><KioskIcon name="info" />If you feel worse while you wait, tell the front desk right away.</p><div className="checkin-done-actions"><Button className="checkin-secondary" onClick={c.reset}>Check in someone else</Button><ResetCountdown /></div></div>}
      {(validation || c.error) && <p id="checkin-error" className="checkin-error" role="alert">{validation || c.error}</p>}
      {help && <p className="checkin-help" role="status">Please ask a staff member to help you check in. You can skip the face scan and continue with the form.</p>}
    </div>
    {c.step === 'welcome' && <footer className="checkin-footer"><span>Crisp is a check-in helper, not a doctor. If you feel very unwell, tell the front desk right away.</span><span>We save a face pattern to find you in the waiting room — never your photo.</span></footer>}
  </section></CheckInContext.Provider>;
}
