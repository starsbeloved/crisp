import { recordReadBack } from '../../server/records.ts';
import { useEffect, useRef, useState } from 'react';
import type { RecordResult } from '../../server/records.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { Crisp } from '../ui/Crisp.tsx';
import { ExamChart } from './ExamChart.tsx';
import { DoctorBrief } from './DoctorBrief.tsx';
import { PatientDone } from '../staff/PatientDone.tsx';
import { DoctorAgent } from './DoctorAgent.tsx';
import { examVisits, normalizeRoom, RECORDS_LABEL, resolveExamName, type ExamCommand } from './model.ts';
import { useDoctorVoice } from './useDoctorVoice.ts';
import { useExamRecognition } from './useExamRecognition.ts';
import './exam.css';

export function ExamPage() {
  const room = normalizeRoom(new URLSearchParams(location.search).get('room') || '1');
  const { state, connected } = useRoomState();
  const [now, setNow] = useState(Date.now());
  const [selection, setSelection] = useState<{ id: string; kind: 'recognized' | 'manual' | 'voice' } | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [replay, setReplay] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [reply, setReply] = useState<{ key: string; text: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [lookup, setLookup] = useState<{ key: string; status: 'ready' | 'error'; result: RecordResult | null } | null>(null);
  const candidates = examVisits(state?.visits ?? [], room);
  const visit = candidates.find(item => item.id === selection?.id) ?? candidates[0] ?? null;
  const key = visit ? `${visit.id}:${visit.name}:${visit.answers.dateOfBirth ?? ''}` : '';
  const record = lookup?.key === key ? lookup.result?.record ?? null : null;
  const recordStatus = lookup?.key === key ? lookup.status : 'loading';
  const video = useRef<HTMLVideoElement>(null);
  const recognition = useExamRecognition(video, state?.visits ?? [], room,
    cameraEnabled && connected && (Boolean(replay) || candidates.some(item => item.faceEnrolled)),
    id => setSelection(current => current?.id === id && current.kind === 'recognized' ? current : { id, kind: 'recognized' }), replay);
  const voice = useDoctorVoice(voiceEnabled && connected, command => { void handleCommand(command); });
  const spoken = useRef('');
  useEffect(() => { setSelection(null); setReply(null); }, [candidates[0]?.id]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => () => { if (replay) URL.revokeObjectURL(replay); }, [replay]);
  useEffect(() => {
    if (!visit) return;
    const abort = new AbortController();
    void fetch(`/api/records?${new URLSearchParams({ visitId: visit.id })}`, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const result: RecordResult = await response.json();
      if (result.visitId !== visit.id) throw new Error();
      if (!abort.signal.aborted) setLookup({ key, result, status: 'ready' });
    }).catch(() => { if (!abort.signal.aborted) setLookup({ key, result: null, status: 'error' }); });
    return () => abort.abort();
  }, [key, retry]);
  useEffect(() => {
    if (!visit || !connected || !voiceEnabled || spoken.current === visit.id) return;
    spoken.current = visit.id; voice.speak(`This is ${visit.name}. Their chart is on screen.`);
  }, [visit?.id, connected, voiceEnabled]);
  function respond(text: string) { setReply({ key, text }); voice.speak(text); }
  async function handleCommand(command: ExamCommand) {
    if (!connected) return;
    if (command.kind === 'chart') {
      const match = resolveExamName(candidates, command.name);
      if (!match) { respond('Please select the patient on screen. No unique exact name was found in this room.'); return; }
      setSelection({ id: match.id, kind: 'voice' }); setReply(null);
      if (spoken.current === match.id) voice.speak(`This is ${match.name}. Their chart is on screen.`);
      return;
    }
    if (command.kind === 'allergies') {
      if (!visit) { respond('Select a patient first.'); return; }
      try {
        const response = await fetch('/api/records/get_record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: visit.name, visitId: visit.id, room }), signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error();
        const result: RecordResult = await response.json();
        // A response belongs only to the chart that was queried.
        if (activeKey.current !== key || !online.current) return;
        respond(result.record ? recordReadBack(visit.name, result) : result.message);
      } catch { if (activeKey.current === key && online.current) respond('Recorded allergies are unavailable. Please review the chart.'); }
      return;
    }
    respond('I can pull up a chart by exact name or read recorded allergies.');
  }
  const activeKey = useRef(key); activeKey.current = key;
  const online = useRef(connected); online.current = connected;
  const arrived = selection?.id === visit?.id && selection?.kind === 'recognized';
  return <div className="exam-page">
    <div className="exam-toolbar"><div><p className="exam-eyebrow">Crisp · clinician view</p><h2>Exam room {room}</h2><span className="exam-demo-label">{RECORDS_LABEL}</span></div><span className={`exam-connection ${connected ? '' : 'offline'}`} role="status">{connected ? 'Connected · read only' : 'Disconnected · information may be out of date'}</span></div>
    <div className="exam-tools">
      <label>Called to this room<select title="Queue number" aria-label="Patient chart" value={visit?.id ?? ''} onChange={event => { setSelection({ id: event.target.value, kind: 'manual' }); setReply(null); }} disabled={!candidates.length || !connected}>
        {!candidates.length && <option value="">Waiting for patient</option>}{candidates.map(item => <option key={item.id} value={item.id}>#{item.queueNo} · {item.name} — Room {room}</option>)}
      </select></label>
      <PatientDone room={room} visitId={visit?.id} connected={connected} />
      <button type="button" className="secondary" disabled={!connected || !voice.available} aria-pressed={voiceEnabled} onClick={() => { setVoiceEnabled(!voiceEnabled); if (voiceEnabled) window.speechSynthesis?.cancel(); }}>{voiceEnabled ? 'Stop browser chart voice · mic on' : 'Browser chart voice (fallback)'}</button>
      <button type="button" className="secondary" disabled={!visit || !connected} onClick={() => { void handleCommand({ kind: 'allergies' }); }}>Read recorded allergies</button>
      <div className="exam-camera"><video ref={video} autoPlay playsInline muted aria-label="Exam room recognition camera" /><div><p>{recognition.replay ? 'REPLAY · ' : ''}{recognition.status}</p><button className="secondary" type="button" aria-pressed={cameraEnabled} onClick={() => setCameraEnabled(!cameraEnabled)}>{cameraEnabled ? 'Turn camera off' : 'Turn camera on'}</button></div></div>
      <label className="exam-replay">REPLAY · local video<input type="file" accept="video/*" aria-label="Replay recognition video" onChange={event => { const file = event.target.files?.[0]; setReplay(file ? URL.createObjectURL(file) : null); setSelection(null); }} /></label>
      {replay && <button type="button" className="secondary" onClick={() => { setReplay(null); setSelection(null); }}>Use webcam</button>}
    </div>
    <p className="exam-voice-status" role="status">{reply?.key === key ? reply.text : voice.status}{voiceEnabled && ' · Browser voice · Try “Hey Crisp, any allergies?”'}</p>
    {!voiceEnabled && <DoctorAgent state={connected ? state : null} room={room} visitId={visit?.id} onRecord={result => {
      if (result && typeof result === 'object' && 'visitId' in result && typeof result.visitId === 'string' && candidates.some(item => item.id === result.visitId)) {
        setSelection({ id: result.visitId, kind: 'voice' }); setReply(null);
      }
    }} />}
    {!visit || !state ? <section className="exam-idle"><Crisp size={120} /><h1>Room {room} · waiting for patient</h1><p>Call a patient to this room from the Command Center. Their chart will preload here.</p></section> : <>
      <div className="exam-arrival"><Crisp size={80} state={arrived ? 'happy' : 'idle'} /><p><strong>{arrived ? `${visit.name} · ${recognition.replay ? 'REPLAY face match' : 'face recognized'}` : `${visit.name} is on the way`}</strong>{arrived ? 'Their chart is on screen.' : 'Chart preloaded from call-in. Arrival has not been confirmed.'}</p></div>
      <DoctorBrief visit={visit} state={{ ...state, serverNow: now }} />
      <ExamChart visit={visit} state={{ ...state, serverNow: now }} record={record} recordStatus={recordStatus} connected={connected} />
      {recordStatus === 'error' && <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Retry record lookup</button>}
    </>}
  </div>;
}
