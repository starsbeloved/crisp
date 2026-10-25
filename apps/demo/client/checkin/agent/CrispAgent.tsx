import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import { CheckInContext, type CheckInController } from '../controller-types.ts';
import { useRoomState } from '../../lib/useRoomState.ts';
import { Crisp, type CrispState } from '../../ui/Crisp.tsx';
import { createCheckInTools } from './tools.ts';
import { useVoiceAgent } from './useVoiceAgent.ts';

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
  if (!voice.available || tapping || controller.step === 'done') return null;
  const active = voice.status !== 'disconnected';
  return <section aria-label="Talk to Crisp" style={{ textAlign: 'center', padding: '16px 0' }}>
    <Crisp size={240} state={voice.mascotState} level={voice.level} />
    <p role="status">{voice.status === 'connecting' ? 'Connecting to Crisp…' : active ? voice.mascotState === 'talking' ? 'Crisp is speaking' : voice.mascotState === 'thinking' ? 'Saving what you said…' : 'Crisp is listening…' : 'Tell Crisp in your own words.'}</p>
    <div role="log" aria-label="Conversation captions" aria-live="polite" style={{ maxHeight: 180, overflowY: 'auto', textAlign: 'left' }}>
      {voice.captions.map((caption, i) => <p key={i}><strong>{caption.speaker}:</strong> {caption.text}</p>)}
    </div>
    {!active && <button type="button" onClick={() => { controller.setVia('voice'); void voice.start(); }}>Talk to Crisp</button>}
    <button type="button" onClick={() => { voice.endSession(); controller.setVia('form'); setTapping(true); }}>I’d rather tap</button>
  </section>;
}

function CrispDemo() {
  const [state, setState] = useState<CrispState>('idle');
  const [level, setLevel] = useState(0.6);
  return <section aria-label="Crisp character preview" style={{ padding: 16, textAlign: 'center' }}>
    <Crisp state={state} size={260} level={level} />
    <label>Character state <select value={state} onChange={e => setState(e.target.value as CrispState)}>
      {(['idle', 'listening', 'thinking', 'talking', 'happy', 'pointing'] as const).map(item => <option key={item}>{item}</option>)}
    </select></label>
    <label>Mouth openness <input type="range" min="0" max="1" step="0.05" value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
  </section>;
}
