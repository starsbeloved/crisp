import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConversationProvider } from '@elevenlabs/react';
import { CheckInContext, type CheckInController } from '../controller-types.ts';
import { useRoomState } from '../../lib/useRoomState.ts';
import { Crisp, type CrispState } from '../../ui/Crisp.tsx';
import { createCheckInTools } from './tools.ts';
import { useVoiceAgent } from './useVoiceAgent.ts';
import { KioskIcon } from '../ui/KioskIcon.tsx';
import { Understood } from '../ui/Understood.tsx';

export function CrispAgent({ optionsTarget }: { optionsTarget?: HTMLElement | null }) {
  const controller = useContext(CheckInContext);
  const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('crispdemo') === '1';
  return <>{demo && <CrispDemo />}{controller && <ConversationProvider><VoiceCheckIn controller={controller} optionsTarget={optionsTarget} /></ConversationProvider>}</>;
}

function VoiceCheckIn({ controller, optionsTarget }: { controller: CheckInController; optionsTarget?: HTMLElement | null }) {
  const { state } = useRoomState();
  const current = useRef(controller); current.current = controller;
  const atWelcome = controller.step === 'welcome';
  const tools = useMemo(() => createCheckInTools(() => current.current), [atWelcome]);
  const voice = useVoiceAgent('checkin', Boolean(state?.providers.agent), tools, "Have a warm, brief conversation, not a questionnaire. Ask name and call set_name. Offer date of birth and phone, save through set_patient_details; null if declined. Ask permission for start_face_scan. After a successful scan, say Hold still for a moment — I’m checking your pulse. Wait quietly while the on-screen pulse check runs; resume when it finishes or is skipped. Then ask an open question in your own words, such as What brings you in? Listen to what they say. Call save_answers with reason in their exact words; include onset/trend ONLY if they actually said them. Missing timing or trend must stay null; never ask a required onset/trend checklist. Call get_follow_up_question for one specific, natural follow-up tied to their words. Ask only the returned question (never the Next instruction) and save their answer with save_follow_up, or honor a decline. One adaptive follow-up is enough; never more than two and never loop. Briefly confirm what you understood, let them correct it, then finish_check_in and speak only the real returned queue number. No diagnosis, treatment or interpretation. If a tool fails, offer the visible form. Current on-screen step: " + controller.step + ". If the patient uses Continue, resume from that step and do not move them back.");
  const [tapping, setTapping] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { endSession } = voice;
  useEffect(() => {
    if (atWelcome) { setTapping(false); setShowAnswers(false); setShowHistory(false); }
  }, [atWelcome]);
  useEffect(() => {
    if (controller.step !== 'done') return;
    // Give Crisp time to speak the real queue number, then release the microphone.
    const timer = setTimeout(endSession, 8000);
    return () => { clearTimeout(timer); endSession(); };
  }, [controller.step, endSession]);
  if (tapping || controller.step === 'done') return null;
  const active = voice.status !== 'disconnected';
  const showConversation = active || (!atWelcome && voice.captions.length > 0);
  const currentSpeech = voice.captions.findLast(caption => caption.speaker === 'Crisp');
  const latestCaption = voice.captions.at(-1);
  const displayOptions = showConversation && <>
    <details className="checkin-view-options"><summary>View options</summary><div className="checkin-view-toggles">
      <label><span>Show answer summary</span><input type="checkbox" role="switch" aria-label="Show answer summary" checked={showAnswers} onChange={event => setShowAnswers(event.target.checked)} /></label>
      <label><span>Show conversation history</span><input type="checkbox" role="switch" aria-label="Show conversation history" checked={showHistory} onChange={event => setShowHistory(event.target.checked)} /></label>
    </div></details>
    {showHistory && <section className="checkin-history" aria-label="Conversation history">
      <h2>Conversation history</h2>
      {!voice.captions.length && <p>Your conversation will appear here.</p>}
      {voice.captions.map((caption, i) => <p key={i}><strong>{caption.speaker}: </strong>{caption.text}</p>)}
    </section>}
    {active && showAnswers && <Understood controller={controller} />}
  </>;
  return <section aria-label="Talk to Crisp" className={active ? 'checkin-voice-active' : 'checkin-voice-launch'}>
    <div className="checkin-conversation">
      {showConversation && <div className="checkin-voice-scene">
        <div className="checkin-speech" role="log" aria-label="Conversation captions" aria-live="polite" aria-atomic="true"><strong>Crisp: </strong><p>{currentSpeech?.text || (voice.status === 'connecting' ? 'One moment while we connect…' : active ? 'Say hello when you’re ready.' : 'We can try talking again, or you can tap below.')}</p></div>
        {latestCaption?.speaker === 'You' && <p className="checkin-latest-reply"><strong>You: </strong>{latestCaption.text}</p>}
        <div className="checkin-voice-character"><Crisp size={300} state={voice.mascotState} level={voice.level} />
        <p className="checkin-voice-status" role="status"><span className="checkin-levels" aria-hidden="true">{[0.65, 1, 0.8, 0.5].map((scale, index) => <span key={index} style={{ transform: `scaleY(${Math.max(0.2, voice.level * scale)})` }} />)}</span>{!active ? 'Conversation paused' : voice.status === 'connecting' ? 'Connecting to Crisp…' : voice.mascotState === 'talking' ? 'Crisp is speaking' : voice.mascotState === 'thinking' ? 'Saving what you said…' : 'Crisp is listening…'}</p>
        </div>
      </div>}
      <div className="checkin-voice-actions">
        {!active && <button type="button" className="checkin-primary checkin-voice-start" onClick={() => { controller.setVia('voice'); controller.goTo('name'); void voice.start(); }}><KioskIcon name="mic" />Talk to Crisp</button>}
        <button type="button" className="checkin-secondary checkin-voice-tap" onClick={() => { voice.endSession(); controller.setVia('form'); controller.goTo('name'); setTapping(true); }}>I’d rather tap</button>
      </div>
      {optionsTarget ? createPortal(displayOptions, optionsTarget) : displayOptions}
    </div>
  </section>;
}

function CrispDemo() {
  const [state, setState] = useState<CrispState>('idle');
  const [level, setLevel] = useState(0.6);
  return <section aria-label="Crisp character preview" className="checkin-demo">
    <Crisp state={state} size={260} level={level} />
    <label>Character state <select value={state} onChange={e => setState(e.target.value as CrispState)}>
      {(['idle', 'listening', 'thinking', 'talking', 'happy', 'pointing'] as const).map(item => <option key={item}>{item}</option>)}
    </select></label>
    <label>Mouth openness <input type="range" min="0" max="1" step="0.05" value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
  </section>;
}
