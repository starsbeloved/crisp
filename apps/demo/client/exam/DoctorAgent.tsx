import { useMemo, useRef } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import type { RoomState } from '../../shared/types.ts';
import { useVoiceAgent } from '../checkin/agent/useVoiceAgent.ts';
import { createExamVoiceTools } from './voiceTools.ts';

export function DoctorAgent(props: { state: RoomState | null; room: string }) {
  return <ConversationProvider><DoctorConversation {...props} /></ConversationProvider>;
}
function DoctorConversation({ state, room }: { state: RoomState | null; room: string }) {
  const current = useRef({ state, room }); current.current = { state, room };
  const tools = useMemo(() => createExamVoiceTools(() => current.current.state, () => current.current.room), []);
  const voice = useVoiceAgent('nurse', Boolean(state?.providers.agent), tools);
  if (!voice.available) return null;
  return <section className="exam-agent" aria-label="Doctor voice agent">
    <button type="button" className="secondary" disabled={!state} aria-pressed={voice.status !== 'disconnected'} onClick={() => { if (voice.status === 'disconnected') void voice.start(); else voice.endSession(); }}>
      {voice.status === 'disconnected' ? 'Talk to Crisp · nurse agent' : 'End agent session · mic on'}
    </button><p className="exam-muted">Nurse agent + get_record · recorded data only · {voice.status}</p>
    {voice.captions.slice(-2).map((caption, i) => <p key={i}>{caption.speaker}: {caption.text}</p>)}
  </section>;
}
