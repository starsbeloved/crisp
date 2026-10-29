import { useRoomState } from '../lib/useRoomState.ts';
import { Crisp } from '../ui/Crisp.tsx';
import { useMonitoringSound } from '../dashboard/useVoice.ts';
import { useHallwayCallout } from './useHallwayCallout.ts';
import { hallwaySpeech } from './callout.ts';
import { roomLabel } from '../staff/rooms.ts';
import { WaitTimeBoard } from './WaitTimeBoard.tsx';
import './lobby.css';

function AppleMark() {
  return <svg className="lobby-apple-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 9c-2-2-8-2-10 3-2 6 1 14 6 15 2 .4 3-.6 4-.6s2 1 4 .6c5-1 8-9 6-15-2-5-8-5-10-3z" fill="var(--c-red)" /><path d="M16 9c0-2 .5-4 2-5.5" stroke="var(--c-text)" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M17.5 6c2-3 6-3.5 8-2.5-1.5 3-5.5 3.5-8 2.5z" fill="var(--c-leaf)" /></svg>;
}

export function LobbyPage() {
  const { state, connected } = useRoomState();
  const { enabled: sound, toggle: toggleSound } = useMonitoringSound();
  const call = state?.nowCalling;
  // Public screen: first name only for the person being called; the queue below stays initial-only.
  const initial = call ? call.name.trim().split(/\s+/)[0] ?? '' : '';
  const voice = useHallwayCallout(sound, call ?? null, true);
  const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const queueKey = state?.visits.map(v => `${v.id}:${v.status}:${v.calledAt}`).join(',') ?? '';

  return <div className="lobby">
    <header className="lobby-header"><a href="/" className="lobby-brand"><AppleMark /><span>Waiting room</span></a><time dateTime={new Date().toISOString()}>{now}</time><button className="lobby-sound" aria-pressed={sound} onClick={toggleSound}>{sound ? 'Disable sound' : 'Enable sound'}</button></header>
    <div className="lobby-main">
      <section className={`lobby-mascot-stage ${voice.talkingId ? 'speaking' : ''}`} aria-hidden={call ? undefined : 'true'}>
        {call && <p className="lobby-quote">“{hallwaySpeech(call)}”</p>}
        <div className="lobby-mascot-disc"><Crisp size={600} state={voice.talkingId ? 'talking' : call ? 'pointing' : 'idle'} /></div>
      </section>
      <div className="lobby-right"><section className="lobby-call-panel" aria-live="polite">
        {call ? <>
          <div className="lobby-call-label">Now calling</div>
          <div className="lobby-called-person"><span>{initial}</span><strong>#{call.queueNo}</strong></div>
          <div className="lobby-room"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 7l5 5-5 5" /></svg>{roomLabel(call.room)}</div>
        </> : <>
          <div className="lobby-call-label">Welcome</div>
          <div className="lobby-idle-title">Please take a seat.</div>
          <p className="lobby-idle-copy">Crisp will call you when it’s your turn.</p>
        </>}
      </section>
      <WaitTimeBoard refreshKey={queueKey} />
      </div>
    </div>
    <footer className="lobby-footer"><span className="lobby-info" aria-hidden="true">i</span><span>{voice.error || (voice.talkingId ? '🔊 speaking' : connected ? 'Feeling worse while you wait? Please tell the front desk.' : 'Reconnecting to the waiting room…')}</span></footer>
  </div>;
}
