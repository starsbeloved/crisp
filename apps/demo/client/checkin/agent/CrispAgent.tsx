import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import { CheckInContext, type CheckInController } from '../controller-types.ts';
import { useRoomState } from '../../lib/useRoomState.ts';
import { Crisp, type CrispState } from '../../ui/Crisp.tsx';
import { createCheckInTools } from './tools.ts';
import { useVoiceAgent } from './useVoiceAgent.ts';
import { KioskIcon } from '../ui/KioskIcon.tsx';
import { Understood } from '../ui/Understood.tsx';

export function CrispAgent() {
  const controller = useContext(CheckInContext);
  const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('crispdemo') === '1';
  return <>{demo && <CrispDemo />}{controller && <ConversationProvider><VoiceCheckIn controller={controller} /></ConversationProvider>}</>;
}

function VoiceCheckIn({ controller }: { controller: CheckInController }) {
  const { state } = useRoomState();
  const current = useRef(controller); current.current = controller;
  const atWelcome = controller.step === 'welcome';
  const tools = useMemo(() => createCheckInTools(() => current.current), [atWelcome]);
  const voice = useVoiceAgent('checkin', Boolean(state?.providers.agent), tools, "Check-in order: ask name and call set_name; ask What's your date of birth? Pass the date as spoken to set_patient_details; it normalizes dates itself. Ask for the month name if unclear; ask And a phone number we can reach you on? Call set_patient_details; use null for declined details, never guess. Ask permission and call start_face_scan; ask reason, onset, trend and call save_answers; MUST call get_follow_up_question, explain it is because of the patient's own words, ask the exact returned question and call save_follow_up; then finish_check_in. Do not invent a follow-up or a queue number. If a tool is unavailable, help the patient switch to taps. No diagnosis or interpretation. Follow the Next instruction in each tool result. Current on-screen step: " + controller.step + ". If the patient uses Continue, resume from that step and do not move them back.");
  const captionBox = useRef<HTMLDivElement>(null);
  const followCaptions = useRef(true);
  useEffect(() => {
    if (followCaptions.current && captionBox.current) captionBox.current.scrollTop = captionBox.current.scrollHeight;
  }, [voice.captions]);
  const [tapping, setTapping] = useState(false);
  const { endSession } = voice;
  useEffect(() => {
    if (atWelcome) setTapping(false);
  }, [atWelcome]);
  useEffect(() => {
    if (controller.step !== 'done') return;
    // Give Crisp time to speak the real queue number, then release the microphone.
    const timer = setTimeout(endSession, 8000);
    return () => { clearTimeout(timer); endSession(); };
  }, [controller.step, endSession]);
  if (tapping || controller.step === 'done') return null;
  const active = voice.status !== 'disconnected';
  const showConversation = active || voice.captions.length > 0;
  return <section aria-label="Talk to Crisp" className={active ? 'checkin-voice-active' : 'checkin-voice-launch'}>
    <div className="checkin-conversation">
      {showConversation && <div className="checkin-voice-character"><Crisp size={300} state={voice.mascotState} level={voice.level} />
        <p className="checkin-voice-status" role="status"><span className="checkin-levels" aria-hidden="true">{[0.65, 1, 0.8, 0.5].map((scale, index) => <span key={index} style={{ transform: `scaleY(${Math.max(0.2, voice.level * scale)})` }} />)}</span>{voice.status === 'connecting' ? 'Connecting to Crisp…' : voice.mascotState === 'talking' ? 'Crisp is speaking' : voice.mascotState === 'thinking' ? 'Saving what you said…' : 'Crisp is listening…'}</p>
      </div>}
      {showConversation && <div ref={captionBox} onScroll={event => { const box = event.currentTarget; followCaptions.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48; }} className="checkin-captions" role="log" aria-label="Conversation captions" aria-live="polite">
        {!voice.captions.length && <p>Say hello to Crisp. Your conversation will appear here.</p>}
        {voice.captions.map((caption, i) => <div className="checkin-caption" data-speaker={caption.speaker} key={i}><strong>{caption.speaker}: </strong><p>{caption.text}{i === voice.captions.length - 1 && <span className="checkin-caption-caret" aria-hidden="true" />}</p></div>)}
      </div>}
      <div className="checkin-voice-actions">
        {!active && <button type="button" className="checkin-primary checkin-voice-start" onClick={() => { controller.setVia('voice'); controller.goTo('name'); void voice.start(); }}><KioskIcon name="mic" />Talk to Crisp</button>}
        <button type="button" className="checkin-secondary checkin-voice-tap" onClick={() => { voice.endSession(); controller.setVia('form'); controller.goTo('name'); setTapping(true); }}>I’d rather tap</button>
      </div>
    </div>
    {active && <Understood controller={controller} />}
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
