import { HallwayCheckBack } from '../staff/HallwayCheckBack.tsx';
import { useState } from 'react';
import type { NowCalling } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { firstName } from '../dashboard/presentation.ts';
import { useVoice } from '../dashboard/useVoice.ts';
import { Crisp } from '../ui/Crisp.tsx';

/** The hallway only receives the public call-out, never a visit's answers or phone. */
export function NowCallingPanel({ call, connected, soundEnabled }: { call: NowCalling | null; connected: boolean; soundEnabled?: boolean }) {
  const [localSound, setSound] = useState(false);
  const sound = soundEnabled ?? localSound;
  const speech = call ? `${firstName(call.name)}, number ${call.queueNo}, please come to ${call.room}.` : '';
  const voice = useVoice(sound, call && (call.audio === 'ready' || call.audio === 'failed') ? [{
    key: call.id, id: call.id, url: call.audio === 'ready' ? api.callAudioUrl(call.id) : null, speech,
  }] : []);

  return <aside className="room-hallway" aria-label="Hallway call-out">
    <div className="room-call-heading"><h2>Now calling</h2></div>
    <div className="room-call-content" aria-live="polite" aria-atomic="true">
      {call ? <>
        <p className="room-call-name">{firstName(call.name)}</p>
        <p className="room-call-number">#{call.queueNo}</p>
        <p className="room-call-destination"><span aria-hidden="true">→ </span>{call.room}</p>
      </> : <><p className="room-call-welcome">Please take a seat.</p><p>Crisp will call you when it’s your turn.</p></>}
    </div>
    <div className="room-call-mascot"><Crisp size={260} state={voice.talkingId ? 'talking' : call ? 'pointing' : 'idle'} /></div>
    {call && <p className="room-call-caption">“{speech}”</p>}
    {soundEnabled === undefined && <button className="secondary room-sound" aria-pressed={sound} onClick={() => setSound(value => !value)}>{sound ? 'Disable sound' : 'Enable sound'}</button>}
    <p className="room-call-status" role="status">{voice.error || (!connected ? 'Reconnecting to the waiting room…' : sound ? 'Call-outs play once.' : 'Enable sound to hear call-outs.')}</p>
    <HallwayCheckBack />
    <p className="room-hallway-note">Feeling worse? Please tell the front desk.</p>
  </aside>;
}
