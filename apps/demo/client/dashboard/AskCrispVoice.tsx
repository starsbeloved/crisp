import { useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import type { RoomState } from '../../shared/types.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { Crisp } from '../ui/Crisp.tsx';
import { useVoiceAgent } from '../checkin/agent/useVoiceAgent.ts';

export function roomDigest(state: RoomState | null, now = Date.now()): string {
  if (!state) return JSON.stringify({ status: 'unavailable', message: 'Room information is not connected.' });
  return JSON.stringify({ recordedAt: now, visits: state.visits.map(visit => {
    const vitals = state.vitals[visit.id];
    const stale = !vitals || now - vitals.lastSeenAt > 5000;
    return {
      name: visit.name, queueNo: visit.queueNo, status: visit.status, room: visit.room,
      answers: visit.answers, summary: visit.summary,
      cameraEstimates: vitals ? {
        hrBpm: !stale && ['good', 'fair'].includes(vitals.hrQuality) ? vitals.hrBpm : null, hrQuality: vitals.hrQuality,
        rrBpm: !stale && ['good', 'fair'].includes(vitals.rrQuality) ? vitals.rrBpm : null, rrQuality: vitals.rrQuality,
        source: vitals.source, lastSeenAt: vitals.lastSeenAt, stale, hint: vitals.hint,
        posture: stale ? null : vitals.posture, cameraId: vitals.cameraId,
      } : null,
      alerts: state.alerts.filter(alert => alert.visitId === visit.id).slice(-5).map(alert => ({
        level: alert.level, status: alert.status, reasons: alert.reasons, facts: alert.facts,
        openedAt: alert.openedAt, checkedAt: alert.checkedAt, explanation: alert.explanation,
      })),
    };
  }) });
}

export function AskCrispVoice() {
  const [holding, setHolding] = useState(false);
  return <ConversationProvider isMuted={!holding}><NurseVoice holding={holding} setHolding={setHolding} /></ConversationProvider>;
}

function NurseVoice({ holding, setHolding }: { holding: boolean; setHolding: (value: boolean) => void }) {
  const { state, connected } = useRoomState();
  const current = useRef(state); current.current = connected ? state : null;
  const tools = useMemo(() => ({ get_room_digest: () => roomDigest(current.current) }), []);
  const voice = useVoiceAgent('nurse', Boolean(state?.providers.agent), tools);
  const { endSession } = voice;
  function release() { setHolding(false); }
  useEffect(() => { if (!connected) setHolding(false); }, [connected, setHolding]);
  useEffect(() => {
    const releaseMic = () => setHolding(false);
    window.addEventListener('blur', releaseMic);
    document.addEventListener('visibilitychange', releaseMic);
    return () => { window.removeEventListener('blur', releaseMic); document.removeEventListener('visibilitychange', releaseMic); };
  }, [setHolding]);
  if (!voice.available) return null;
  function hold() {
    if (!connected) return;
    setHolding(true); void voice.start();
  }
  return <section aria-label="Ask Crisp by voice" style={{ padding: '12px 0' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Crisp size={80} state={voice.mascotState} level={voice.level} />
      <button type="button" aria-pressed={holding} disabled={!connected} style={{ minHeight: 44, touchAction: 'none' }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); hold(); }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
        onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); hold(); } }}
        onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release(); } }}>
        {holding ? voice.status === 'connected' ? 'Listening… release to ask' : 'Connecting… keep holding' : 'Hold to ask Crisp'}
      </button>
      {voice.status !== 'disconnected' && <button type="button" onClick={() => { release(); endSession(); }}>End voice</button>}
    </div>
    <p role="status">{!connected ? 'Room disconnected. Use text Ask Crisp when connected.' : voice.status === 'connected' && !holding ? 'Microphone muted. Hold the button or Space to speak.' : 'Answers use recorded room information. You can also use text Ask Crisp.'}</p>
    <div role="log" aria-label="Nurse voice captions" aria-live="polite" style={{ maxHeight: 160, overflowY: 'auto' }}>
      {voice.captions.map((caption, i) => <p key={i}><strong>{caption.speaker}:</strong> {caption.text}</p>)}
    </div>
  </section>;
}
