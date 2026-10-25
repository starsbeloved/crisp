import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { Crisp } from '../ui/Crisp.tsx';
import { useVoice } from '../dashboard/useVoice.ts';
import { firstName } from '../dashboard/presentation.ts';
import './lobby.css';

export function LobbyPage() {
  const { state, connected } = useRoomState();
  const [sound, setSound] = useState(false);
  const call = state?.nowCalling;
  const voice = useVoice(sound, call && (call.audio === 'ready' || call.audio === 'failed') ? [{ key: call.id, id: call.id, url: call.audio === 'ready' ? api.callAudioUrl(call.id) : null, speech: `${firstName(call.name)}, number ${call.queueNo}, please come to ${call.room}.` }] : []);
  const waiting = state?.visits.filter(v => v.status === 'waiting').sort((a, b) => a.queueNo - b.queueNo) ?? [];
  return <div className="lobby"><div className="lobby-top"><div><p className="lobby-eyebrow">Crisp · waiting room companion</p><h1>You're in the right place.</h1></div>
    <button className="lobby-sound" aria-pressed={sound} onClick={() => setSound(v => !v)}>{sound ? 'Disable sound' : 'Enable sound'}</button></div>
    <p className="lobby-connection" role="status">{connected ? 'Connected' : 'Reconnecting to the waiting room…'}</p>
    <section className={`lobby-call ${voice.talkingId ? 'speaking' : ''}`} aria-live="polite"><div className="lobby-mascot"><Crisp size={220} state={voice.talkingId ? 'talking' : call ? 'pointing' : 'idle'} /></div>
      {call ? <div key={call.id} className="call-announcement"><p>Now calling</p><h2>{firstName(call.name)}</h2><strong>#{call.queueNo} <span aria-hidden="true">—</span> {call.room}</strong></div> : <div><p>Welcome. You're checked in.</p><h2>Please take a seat.</h2><p>Crisp will call you when it's your turn.</p></div>}
    </section>
    {voice.error && <p role="status">{voice.error}</p>}
    <section className="lobby-queue"><div className="lobby-queue-heading"><h2>Waiting</h2><span>{waiting.length} {waiting.length === 1 ? 'person' : 'people'}</span></div>
      <ol>{waiting.map(visit => <li key={visit.id}><span>#{visit.queueNo}</span><strong>{firstName(visit.name).charAt(0).toLocaleUpperCase()}.</strong></li>)}</ol>
      {!waiting.length && <p>No one is waiting yet.</p>}
    </section><p className="lobby-footer">If you need help while you wait, please speak to a member of staff.</p>
  </div>;
}
