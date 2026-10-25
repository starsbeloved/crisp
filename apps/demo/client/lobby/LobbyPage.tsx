import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { Crisp } from '../ui/Crisp.tsx';
import { useVoice } from '../dashboard/useVoice.ts';
import { firstName } from '../dashboard/presentation.ts';
import './lobby.css';

function AppleMark() {
  return <svg className="lobby-apple-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 9c-2-2-8-2-10 3-2 6 1 14 6 15 2 .4 3-.6 4-.6s2 1 4 .6c5-1 8-9 6-15-2-5-8-5-10-3z" fill="var(--c-red)" /><path d="M16 9c0-2 .5-4 2-5.5" stroke="var(--c-text)" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M17.5 6c2-3 6-3.5 8-2.5-1.5 3-5.5 3.5-8 2.5z" fill="var(--c-leaf)" /></svg>;
}

export function LobbyPage() {
  const { state, connected } = useRoomState();
  const [sound, setSound] = useState(false);
  const call = state?.nowCalling;
  const [chimedCall, setChimedCall] = useState<string | null>(null);
  const heard = useRef<string | null>(null);
  const callReady = Boolean(call && (call.audio === 'ready' || call.audio === 'failed'));
  useEffect(() => {
    if (!sound || !call || !callReady) return;
    if (heard.current === call.id) { setChimedCall(call.id); return; }
    let active = true;
    const id = call.id, chime = new Audio('/sounds/lobby-chime.wav');
    chime.volume = .3;
    function finish() { if (active) { heard.current = id; setChimedCall(id); } }
    chime.onended = finish; chime.onerror = finish;
    const timeout = setTimeout(finish, 1500);
    void chime.play().catch(finish);
    return () => { active = false; clearTimeout(timeout); chime.pause(); chime.onended = null; chime.onerror = null; };
  }, [sound, call?.id, callReady]);
  const voice = useVoice(sound && chimedCall === call?.id, call && (call.audio === 'ready' || call.audio === 'failed') ? [{ key: call.id, id: call.id, url: call.audio === 'ready' ? api.callAudioUrl(call.id) : null, speech: `${firstName(call.name)}, number ${call.queueNo}, please come to ${call.room}.` }] : []);
  const waiting = state?.visits.filter(v => v.status === 'waiting').sort((a, b) => a.queueNo - b.queueNo) ?? [];
  const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const upcoming = waiting.filter(v => v.id !== call?.id).slice(0, 3);

  return <div className="lobby">
    <header className="lobby-header"><a href="/" className="lobby-brand"><AppleMark /><span>Waiting room</span></a><time dateTime={new Date().toISOString()}>{now}</time><button className="lobby-sound" aria-pressed={sound} onClick={() => setSound(v => !v)}>{sound ? 'Disable sound' : 'Enable sound'}</button></header>
    <div className="lobby-main">
      <section className={`lobby-mascot-stage ${voice.talkingId ? 'speaking' : ''}`} aria-hidden={call ? undefined : 'true'}>
        {call && <p className="lobby-quote">“{firstName(call.name)}, number {call.queueNo}, please come to {call.room}.”</p>}
        <div className="lobby-mascot-disc"><Crisp size={600} state={voice.talkingId ? 'talking' : call ? 'pointing' : 'idle'} /></div>
      </section>
      <div className="lobby-right"><section className="lobby-call-panel" aria-live="polite">
        {call ? <>
          <div className="lobby-call-label">Now calling</div>
          <div className="lobby-called-person"><span>{firstName(call.name)}</span><strong>#{call.queueNo}</strong></div>
          <div className="lobby-room"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 7l5 5-5 5" /></svg>{call.room}</div>
        </> : <>
          <div className="lobby-call-label">Welcome</div>
          <div className="lobby-idle-title">Please take a seat.</div>
          <p className="lobby-idle-copy">Crisp will call you when it’s your turn.</p>
        </>}
      </section>
      <section className="lobby-up-next" aria-label="Up next"><h2>Up next</h2>{upcoming.length ? <ol>{upcoming.map(visit => <li key={visit.id}>#{visit.queueNo} · {firstName(visit.name).charAt(0).toLocaleUpperCase()}.</li>)}</ol> : <p>No one else is waiting yet.</p>}</section>
      </div>
    </div>
    <footer className="lobby-footer"><span className="lobby-info" aria-hidden="true">i</span><span>{voice.error || (connected ? 'Feeling worse while you wait? Please tell the front desk.' : 'Reconnecting to the waiting room…')}</span></footer>
  </div>;
}
