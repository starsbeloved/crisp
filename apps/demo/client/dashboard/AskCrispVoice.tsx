import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommandResult } from '../../server/commands.ts';
import { createStaffTools } from '../staff/tools.ts';
import { useWakeWord } from '../staff/useWakeWord.ts';
import { StaffToast } from '../staff/StaffToast.tsx';
import '../staff/staff.css';
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

export interface StaffVoiceProps {
  room?: string; visitId?: string; onRecord?: (result: unknown) => void;
  enabled?: boolean;
  snapshot?: { state: RoomState | null; connected: boolean };
}
export function AskCrispVoice(props: StaffVoiceProps = {}) {
  const [holding, setHolding] = useState(false), [handsFree, setHandsFree] = useState(false);
  const controls = { holding, setHolding, handsFree, setHandsFree };
  return <ConversationProvider isMuted={!holding && !handsFree}>{props.snapshot
    ? <NurseVoice {...props} {...controls} snapshot={props.snapshot} />
    : <ConnectedNurseVoice {...props} {...controls} />}</ConversationProvider>;
}

type VoiceControls = { holding: boolean; setHolding: (value: boolean) => void; handsFree: boolean; setHandsFree: (value: boolean) => void };
function ConnectedNurseVoice(props: StaffVoiceProps & VoiceControls) {
  const snapshot = useRoomState();
  return <NurseVoice {...props} snapshot={snapshot} />;
}
function NurseVoice({ holding, setHolding, handsFree, setHandsFree, room, visitId, onRecord, enabled = true, snapshot }: StaffVoiceProps & VoiceControls & { snapshot: { state: RoomState | null; connected: boolean } }) {
  const { state, connected: liveConnected } = snapshot;
  const connected = liveConnected && enabled;
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [notice, setNotice] = useState<CommandResult | null>(null);
  const current = useRef({ state, connected, room, visitId, onRecord });
  current.current = { state, connected, room, visitId, onRecord };
  const pending = useRef<string | null>(null);
  const starting = useRef(false);
  const tools = useMemo(() => createStaffTools({
    connected: () => current.current.connected,
    digest: () => JSON.stringify({ ...JSON.parse(roomDigest(current.current.connected ? current.current.state : null)),
      screenContext: { room: current.current.room ?? null, selectedVisitId: current.current.visitId ?? null } }),
    notify: (result, tool) => {
      setNotice(result);
      const data = result.data as { suggestionId?: string } | undefined;
      window.dispatchEvent(new CustomEvent('crisp-staff-change', { detail: { spokenSuggestionId: tool === 'shift_summary' && result.ok ? data?.suggestionId : undefined } }));
    },
    onRecord: result => current.current.onRecord?.(result),
  }), []);
  const context = JSON.stringify({ screen: room ? 'Exam room' : 'Crisp Command Center', room, selectedVisitId: visitId,
    instruction: 'Use remove_patient({name}) to remove a patient from the queue only after asking staff to confirm. Records are retained. Use client tools for every staff action. Speak their returned confirmation exactly once. Ask for clarification on ambiguous names. Get the selected patient name from get_room_digest before any allergies request. Read allergies verbatim and label demo records fictional. Never diagnose or rank patients clinically.' });
  const voice = useVoiceAgent('nurse', enabled && Boolean(state?.providers.agent), tools, context);
  const { endSession, status, sendUserMessage } = voice;
  const captionBox = useRef<HTMLDivElement>(null);
  const followCaptions = useRef(true);
  useEffect(() => { if (followCaptions.current && captionBox.current) captionBox.current.scrollTop = captionBox.current.scrollHeight; }, [voice.captions]);
  const wake = useWakeWord(wakeEnabled && connected && voice.available && status === 'disconnected' && !handsFree && !holding,
    command => { if (starting.current) return; pending.current = command || null; starting.current = true; setHandsFree(true); void voice.start(); });
  function release() { setHolding(false); }
  function end() { pending.current = null; starting.current = false; setHandsFree(false); release(); void endSession(); }
  useEffect(() => {
    if (status !== 'connected') return;
    starting.current = false;
    if (pending.current) { const command = pending.current; pending.current = null; sendUserMessage(command); }
  }, [status, sendUserMessage]);
  useEffect(() => {
    if (status === 'disconnected' && handsFree && !starting.current) setHandsFree(false);
  }, [status, handsFree, setHandsFree]);
  useEffect(() => {
    if (!voice.available && handsFree) { starting.current = false; setHandsFree(false); setWakeEnabled(false); setNotice({ ok: false, message: 'Nurse voice unavailable. Use the on-screen actions or text Ask Crisp.' }); }
  }, [voice.available, handsFree, setHandsFree]);
  useEffect(() => { if (!connected) { setWakeEnabled(false); end(); } }, [connected]);
  useEffect(() => {
    const releaseMic = () => { release(); if (document.hidden) { setWakeEnabled(false); end(); } };
    window.addEventListener('blur', releaseMic); document.addEventListener('visibilitychange', releaseMic);
    return () => { window.removeEventListener('blur', releaseMic); document.removeEventListener('visibilitychange', releaseMic); };
  }, []);
  function hold() {
    if (!connected || starting.current) return;
    wake.pause(); pending.current = null; setHolding(true); void voice.start();
  }
  return <section aria-label="Ask Crisp by voice" className="staff-voice">
    <div className="staff-controls">
      <Crisp size={80} state={voice.mascotState} level={voice.level} />
      <button type="button" aria-pressed={holding} disabled={!connected || !voice.available} style={{ minHeight: 44, touchAction: 'none' }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); hold(); }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
        onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); hold(); } }}
        onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release(); } }}>
        {holding ? status === 'connected' ? 'Listening… release to ask' : 'Connecting… keep holding' : 'Hold to ask Crisp'}
      </button>
      <button type="button" disabled={!connected || !voice.available || status === 'connecting'} aria-pressed={handsFree} onClick={() => {
        if (handsFree) { end(); return; }
        wake.pause(); pending.current = null; starting.current = true; setHandsFree(true); void voice.start();
      }}>Talk to Crisp</button>
      <button type="button" className="secondary" aria-pressed={wakeEnabled} disabled={!connected || !wake.available || !voice.available}
        onClick={() => { const next = !wakeEnabled; setWakeEnabled(next); if (!next) end(); }}>
        {wakeEnabled ? 'Stop listening for Hey Crisp' : 'Listen for Hey Crisp'}
      </button>
      {status !== 'disconnected' && <button type="button" onClick={end}>End voice</button>}
    </div>
    <p role="status" className="staff-mic"><span className="staff-mic-light" data-live={wake.listening || holding || (handsFree && status === 'connected')} aria-hidden="true" />{!connected ? 'Mic off · room disconnected.' : !voice.available ? 'Mic off · nurse agent unavailable. Use text or on-screen actions.' : handsFree ? `Mic on · nurse session ${status}` : holding ? 'Mic on · hold to speak' : wakeEnabled ? wake.status : 'Mic off · wake word is off.'}</p>
    <p className="staff-last-heard">Last heard: {wake.lastHeard || voice.captions.filter(c => c.speaker === 'You').at(-1)?.text || 'Nothing yet'}</p>
    <p className="staff-last-heard">Matched wake phrase: {wake.matchedPhrase || 'None yet'}</p>
    <small>Wake listening uses browser speech recognition. Say “Hey Crisp”, then your request. End voice to return to wake listening.</small>
    <StaffToast result={notice} />
    <div ref={captionBox} onScroll={event => { const box = event.currentTarget; followCaptions.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48; }} role="log" aria-label="Nurse voice captions" aria-live="polite" style={{ maxHeight: 160, overflowY: 'auto' }}>
      {voice.captions.map((caption, i) => <p key={i}><strong>{caption.speaker}:</strong> {caption.text}</p>)}
    </div>
  </section>;
}
