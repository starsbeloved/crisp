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
import { detailsError, localToday } from './details.ts';
import { FollowUpContext } from './ui/FollowUpContext.tsx';
import { complaintQuestion } from './followup-policy.ts';
import { PulseCheck } from './ui/PulseCheck.tsx';
import './checkin.css';

const reasons = ['chest pain', 'trouble breathing', 'dizziness or fainting', 'headache', 'fever', 'stomach pain', 'injury', 'nausea', 'allergic reaction', 'other'];
const onsets: Array<[Onset, string]> = [['<1h', 'Less than an hour'], ['today', 'Today'], ['1-3d', '1–3 days'], ['longer', 'Longer']];
const trends: Array<[Trend, string]> = [['worse', 'Getting worse'], ['same', 'About the same'], ['better', 'Getting better']];
const steps: Step[] = ['welcome', 'name', 'face', 'questions', 'followup', 'done'];
const titles: Record<Step, string> = { welcome: "Hi! I’m Crisp.", name: 'What should I call you?', face: 'Look at me for a moment.', pulse: 'Hold still for a moment.', questions: 'What brings you in today?', followup: 'One more thing.', done: 'You’re checked in.' };

/** P7's agent mounts inside the same controller provider as the tap flow. */
export function CrispAgentSlot({ optionsTarget }: { optionsTarget?: HTMLElement | null }) { return <CrispAgent optionsTarget={optionsTarget} />; }
export function CheckInPage() {
  const c = useCheckIn();
  const [help, setHelp] = useState('');
  const [helpBusy, setHelpBusy] = useState(false);
  const [validation, setValidation] = useState('');
  const [optionsTarget, setOptionsTarget] = useState<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const stepIndex = steps.indexOf(c.step);
  useEffect(() => { setValidation(''); setHelp(''); heading.current?.focus(); }, [c.step]);
  function submit(event: FormEvent) {
    event.preventDefault(); setValidation('');
    if (c.step === 'name') {
      if (!c.name.trim()) { setValidation('Please enter your preferred name or alias.'); return; }
      const error = detailsError(c.answers);
      if (error) { setValidation(error); return; }
      void c.startFaceScan();
    } else if (c.step === 'questions') {
      if (!c.answers.reason.trim() && !c.answers.reasonChips.length) { setValidation('Please tell Crisp what brings you in, or choose a chip.'); return; }
      void c.prepareFollowUp();
    } else if (c.step === 'followup') { void c.finish().catch(() => {}); }
  }
  const reasonText = c.answers.reason;
  return <CheckInContext.Provider value={c}><section className="checkin" data-step={c.step} aria-label="Check in with Crisp">
    <div className="checkin-top"><div className="checkin-brand"><KioskIcon name="apple" /><span>{c.step === 'welcome' ? 'Crisp check-in' : c.step === 'done' ? 'All done' : c.step === 'pulse' ? 'Pulse check' : c.step === 'face' ? 'Face scan' : c.step === 'questions' ? 'In your own words' : c.step === 'followup' ? 'One more thing' : 'Your name'}</span></div><div className="checkin-navigation"><Button className="checkin-secondary" type="button" disabled={c.busy || c.step === 'welcome' || c.step === 'done'} onClick={() => c.goTo(c.step === 'pulse' ? 'face' : steps[Math.max(0, stepIndex - 1)])}>Back</Button><Button className="checkin-secondary checkin-help-button" type="button" disabled={helpBusy} onClick={() => {
      setHelpBusy(true);
      void fetch('/api/checkin/help', { method: 'POST', signal: AbortSignal.timeout(4000) }).then(response => {
        if (!response.ok) throw new Error();
        setHelp('A staff member has been notified');
      }).catch(() => setHelp('Could not notify staff. Please ask a staff member at the front desk to help you check in.'))
        .finally(() => setHelpBusy(false));
    }} aria-expanded={Boolean(help)}><KioskIcon name="info" /><span>I need help</span></Button></div><KioskProgress step={c.step} /></div>
    <div className="checkin-card">
      {(c.via !== 'voice' || c.step === 'done') && <div className="checkin-intro-group"><div className="checkin-companion"><Crisp state={c.step === 'welcome' || c.step === 'done' ? 'happy' : c.face.status === 'scanning' && c.step === 'face' ? 'thinking' : 'idle'} size={c.step === 'welcome' ? 480 : c.step === 'done' ? 440 : c.step === 'face' ? 170 : 110} /></div>
      <div className="checkin-intro">
        {c.step === 'done' && <p className="checkin-done-greeting">You’re checked in, {c.name.trim()}.</p>}
        <h1 ref={heading} tabIndex={-1}>{c.step === 'done' ? 'You’re number' : titles[c.step]}</h1>
        {c.step === 'welcome' && <p className="checkin-welcome-copy">Let’s get you checked in. It takes about a minute.</p>}
        {c.step === 'name' && <p>Your preferred name or an alias is fine.</p>}
        {c.step === 'face' && <p>Look at me for a second! Keep your face inside the oval.</p>}
        {c.step === 'questions' && <p>Tap or type — whatever is easier.</p>}
      </div></div>}
      <div className="checkin-agent"><CrispAgentSlot optionsTarget={optionsTarget} /></div>
      {c.step === 'welcome' && <div className="checkin-welcome-actions"><ol className="checkin-how"><li>Tell Crisp your name</li><li>Look at the camera for two seconds</li><li>Say what brings you in, in your own words</li></ol></div>}
      {c.via === 'voice' && ['welcome', 'face', 'followup'].includes(c.step) && <div className="checkin-manual-continue">
        <p>If Crisp pauses, continue here. You can fill or correct each answer on screen.</p>
        <Button type="button" className="checkin-primary" disabled={c.busy} onClick={() => {
          if (c.step === 'welcome') c.goTo('name');
          else if (c.step === 'face') { if (c.face.status === 'saved') c.goTo('questions'); else c.skipFace(); }
          else void c.finish().catch(() => {});
        }}>Continue</Button>
      </div>}
      <form className="checkin-form" onSubmit={submit} aria-busy={c.busy}>
        {c.step === 'name' && <div className="checkin-name-panel">
          <div><label htmlFor="checkin-name">Your name</label><input id="checkin-name" name="name" autoComplete="given-name" maxLength={120} value={c.name} onChange={event => c.setName(event.target.value)} aria-describedby={validation ? 'checkin-error' : undefined} /></div>
          <div className="checkin-details-grid">
            <div><label htmlFor="checkin-dob">Date of birth <span className="checkin-optional">(optional)</span></label><input id="checkin-dob" name="dateOfBirth" type="date" autoComplete="bday" min="1900-01-01" max={localToday()} value={c.answers.dateOfBirth ?? ''} onChange={event => c.setAnswers({ dateOfBirth: event.target.value || null })} aria-describedby="checkin-details-note" /></div>
            <div><label htmlFor="checkin-phone">Phone number <span className="checkin-optional">(optional)</span></label><input id="checkin-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} value={c.answers.phone ?? ''} onChange={event => c.setAnswers({ phone: event.target.value || null })} aria-describedby="checkin-details-note" /></div>
          </div>
          <p id="checkin-details-note">Your date of birth helps staff find your record. Your phone number is shown only to staff. You can leave either blank and ask staff to help.</p>
          <Button className="checkin-primary" type="submit">Continue</Button>
        </div>}

        <div className="checkin-face-layout" hidden={c.step !== 'face' && c.step !== 'pulse'}>
          <div className="checkin-preview"><video ref={c.videoRef} autoPlay muted playsInline aria-label="Check-in camera preview" />{c.step !== 'pulse' && <><FaceGuide message={c.face.message} saved={c.face.status === 'saved'} /><div className="checkin-face-status" role="status" aria-live="polite"><span className="checkin-status-chip" data-saved={c.face.status === 'saved'}>{c.face.message}</span></div></>}{c.replay && <span className="checkin-replay">REPLAY · {c.replay.split('/').pop()}</span>}<span className="checkin-photo-note">Face pattern only — no photo is stored</span></div>
          {c.step === 'pulse' ? <PulseCheck view={c.pulse} replay={Boolean(c.replay)} skip={() => c.completePulse([], 'skipped')} complete={() => c.completePulse(c.pulse?.samples ?? [], 'complete')} /> : <aside className="checkin-face-aside">
            <p className="checkin-face-instruction">One person at a time. Face the camera in good light. Only a face descriptor is saved, never a photo.</p>
            <p className="checkin-camera-message">{c.cameraMessage}</p>
            <div className="checkin-scan-hints"><p>What the scan may tell you</p><div><span>Looking for your face…</span><span>Move a little closer</span><span>Only one person, please</span><span>More light, please</span>{c.face.status === 'saved' && <span className="is-saved">✓ Face saved</span>}</div></div>
            <div className="checkin-scan-actions">{c.face.status === 'saved' ? <><Button className="checkin-primary" type="button" onClick={() => c.goTo('questions')}>Continue</Button><Button className="checkin-secondary" type="button" onClick={() => void c.startFaceScan()}>Retake</Button></> : c.face.status !== 'scanning' && <Button className="checkin-primary" type="button" onClick={() => void c.startFaceScan()}>Try face scan again</Button>}
            <Button className="checkin-secondary checkin-skip" type="button" onClick={c.skipFace}>Skip — staff will help</Button></div>
          </aside>}
        </div>
        {c.step === 'questions' && <>
          <section className="checkin-question-panel"><label className="checkin-question-title" htmlFor="checkin-reason">1. What brings you in today?</label>
          <textarea id="checkin-reason" rows={3} maxLength={4000} value={reasonText} placeholder="Tell me in your own words, or choose below" onChange={event => c.setAnswers({ reason: event.target.value })} />
          <div className="checkin-chips checkin-reasons" role="group" aria-label="Common reasons">{reasons.map(reason => <Button type="button" className="checkin-choice" key={reason} aria-pressed={c.answers.reasonChips.includes(reason)} onClick={() => c.setAnswers({ reasonChips: c.answers.reasonChips.includes(reason) ? c.answers.reasonChips.filter(item => item !== reason) : [...c.answers.reasonChips, reason] })}>{reason}</Button>)}</div></section>
          <fieldset className="checkin-question-panel"><legend>When did it start?</legend><div className="checkin-question-title" aria-hidden="true">2. When did it start? (optional)</div><div className="checkin-chips checkin-onsets">{onsets.map(([value, label]) => <Button type="button" className="checkin-choice" key={value} aria-pressed={c.answers.onset === value} onClick={() => c.setAnswers({ onset: value })}>{label}</Button>)}</div></fieldset>
          <fieldset className="checkin-question-panel"><legend>How has it changed?</legend><div className="checkin-question-title" aria-hidden="true">3. How has it changed? (optional)</div><div className="checkin-chips checkin-trends">{trends.map(([value, label]) => <Button type="button" className="checkin-choice" key={value} aria-pressed={c.answers.trend === value} onClick={() => c.setAnswers({ trend: value })}>{label}</Button>)}</div></fieldset>
          <div className="checkin-form-submit"><p>Your own words are kept exactly as you wrote them.</p><Button className="checkin-primary" type="submit">Continue</Button></div>
        </>}
        {c.step === 'followup' && <section className="checkin-followup-panel">
          <div className="checkin-review"><p><strong>{c.name || 'Your name'}</strong> · {c.face.status === 'saved' ? 'Face saved' : 'Staff can help with your face scan'}</p><p>{reasonText || c.answers.reasonChips.join(', ')}</p><Button type="button" className="checkin-secondary" onClick={() => c.goTo('questions')} disabled={c.busy}>Edit answers</Button></div>
          <FollowUpContext prompt={c.followUpPrompt} />
          {c.followUpLoading ? <p role="status">Crisp is thinking… You can skip this question.</p> : <><label htmlFor="checkin-followup">{c.followUpQuestion || complaintQuestion(c.answers)}</label><textarea id="checkin-followup" rows={2} maxLength={4000} value={c.answers.followUp?.answer ?? ''} onChange={event => c.setFollowUp(c.followUpQuestion || complaintQuestion(c.answers), event.target.value)} disabled={c.busy} /></>}
          <Button className="checkin-primary" type="submit" disabled={c.busy || c.followUpLoading}>{c.busy ? 'Saving check-in…' : c.error ? 'Retry check-in' : 'Finish check-in'}</Button>
          <Button className="checkin-secondary checkin-skip" type="button" disabled={c.busy} onClick={() => { c.setAnswers({ followUp: null }); void c.finish().catch(() => {}); }}>Skip question and check in</Button>
        </section>}
      </form>
      {c.pulseNotice && <p className="checkin-pulse-notice" role="status">{c.pulseNotice}</p>}
      {c.step === 'done' && <div className="checkin-done-content" role="status"><div className="checkin-ticket-row"><strong className="checkin-queue">{c.queueNo}</strong><p>Please take a seat. Crisp will call you by name on the screen when it’s your turn.</p></div><p className="checkin-done-note"><KioskIcon name="info" />If you feel worse while you wait, tell the front desk right away.</p><div className="checkin-done-actions"><Button className="checkin-secondary" onClick={c.reset}>Check in someone else</Button><ResetCountdown /></div></div>}
      {(validation || c.error) && <p id="checkin-error" className="checkin-error" role="alert">{validation || c.error}</p>}
      {help && <p className="checkin-help" role="status">{help}. You can skip the face scan and continue with the form.</p>}
    </div>
    {c.step === 'welcome' && <footer className="checkin-footer"><span>Crisp is a check-in helper, not a doctor. If you feel very unwell, tell the front desk right away.</span><span>We save a face pattern to find you in the waiting room — never your photo.</span></footer>}
    <div className="checkin-bottom-options" ref={setOptionsTarget} />
  </section></CheckInContext.Provider>;
}
