import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import { CheckInContext, type CheckInController } from '../controller-types.ts';
import { useRoomState } from '../../lib/useRoomState.ts';
import { Crisp, type CrispState } from '../../ui/Crisp.tsx';
import { createCheckInTools } from './tools.ts';
import { useVoiceAgent } from './useVoiceAgent.ts';
import { KioskIcon } from '../ui/KioskIcon.tsx';

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
  const voice = useVoiceAgent('checkin', Boolean(state?.providers.agent), tools);
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
      {showConversation && <div className="checkin-captions" role="log" aria-label="Conversation captions" aria-live="polite">
        {!voice.captions.length && <p>Say hello to Crisp. Your conversation will appear here.</p>}
        {voice.captions.map((caption, i) => <div className="checkin-caption" data-speaker={caption.speaker} key={i}><strong>{caption.speaker}: </strong><p>{caption.text}{i === voice.captions.length - 1 && <span className="checkin-caption-caret" aria-hidden="true" />}</p></div>)}
      </div>}
      <div className="checkin-voice-actions">
        {!active && <button type="button" className="checkin-primary checkin-voice-start" onClick={() => { controller.setVia('voice'); void voice.start(); }}><KioskIcon name="mic" />Talk to Crisp</button>}
        <button type="button" className="checkin-secondary checkin-voice-tap" onClick={() => { voice.endSession(); controller.setVia('form'); controller.goTo('name'); setTapping(true); }}>I’d rather tap</button>
      </div>
    </div>
    {active && <Understood controller={controller} />}
  </section>;
}

/** A read-only view of the same fields filled by the existing voice tools. */
function Understood({ controller: c }: { controller: CheckInController }) {
  const reason = c.answers.reason || c.answers.reasonChips.join(', ');
  return <section className="checkin-understood" aria-label="What Crisp understood">
    <h2>What Crisp understood</h2><p>Your answers appear here as we talk. You can switch to tapping to make changes.</p>
    <div key={`name-${c.name}`} className="checkin-understood-field" data-filled={Boolean(c.name.trim())}><span>Name</span><strong>{c.name.trim() || 'Listening for your name…'}</strong></div>
    <div key={`face-${c.face.status}`} className="checkin-understood-field" data-filled={c.face.status === 'saved'}><span>Face scan</span><strong>{c.face.status === 'saved' ? '✓ Face saved' : c.face.message || 'Not scanned yet'}</strong></div>
    <div key={`reason-${reason}`} className="checkin-understood-field" data-filled={Boolean(reason)}><span>Why you’re here</span><strong>{reason ? `“${reason}”` : 'Listening…'}</strong></div>
    <div key={`onset-${c.answers.onset}`} className="checkin-understood-field" data-filled={Boolean(c.answers.onset)}><span>When it started</span><div className="checkin-understood-chips">{([['<1h', 'Under 1 hour'], ['today', 'Today'], ['1-3d', '1–3 days'], ['longer', 'Longer']] as const).map(([value, label]) => <span key={value} className={c.answers.onset === value ? 'is-selected' : undefined}>{label}{c.answers.onset === value && <span className="checkin-sr-only"> — selected</span>}</span>)}</div></div>
    <div key={`trend-${c.answers.trend}`} className="checkin-understood-field" data-filled={Boolean(c.answers.trend)}><span>How it’s changed{!c.answers.trend && ' · listening…'}</span><div className="checkin-understood-chips">{([['worse', 'Getting worse'], ['same', 'About the same'], ['better', 'Getting better']] as const).map(([value, label]) => <span key={value} className={c.answers.trend === value ? 'is-selected' : undefined}>{label}{c.answers.trend === value && <span className="checkin-sr-only"> — selected</span>}</span>)}</div></div>
    <div className="checkin-understood-next">{c.answers.followUp?.answer ? c.answers.followUp.answer : 'One follow-up question from Crisp — next'}</div>
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
