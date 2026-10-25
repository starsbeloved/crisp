import { HallwayCheckBack } from '../staff/HallwayCheckBack.tsx';
import type { NowCalling } from '../../shared/types.ts';
import { firstName } from '../dashboard/presentation.ts';
import { roomLabel } from '../staff/rooms.ts';
import { hallwaySpeech } from '../lobby/callout.ts';
import { useHallwayCallout } from '../lobby/useHallwayCallout.ts';
import { useState } from 'react';
import { Crisp } from '../ui/Crisp.tsx';

/** The hallway only receives the public call-out, never a visit's answers or phone. */
export function NowCallingPanel({ call, connected, soundEnabled }: { call: NowCalling | null; connected: boolean; soundEnabled?: boolean }) {
  const [localSound, setSound] = useState(false);
  const sound = soundEnabled ?? localSound;
  const speech = call ? hallwaySpeech(call) : '';
  const voice = useHallwayCallout(sound, call);

  return <aside className="room-hallway" aria-label="Hallway call-out">
    <div className="room-call-heading"><h2>Now calling</h2></div>
    <div className="room-call-content" aria-live="polite" aria-atomic="true">
      {call ? <>
        <p className="room-call-name">{firstName(call.name)}</p>
        <p className="room-call-number">#{call.queueNo}</p>
        <p className="room-call-destination"><span aria-hidden="true">→ </span>{roomLabel(call.room)}</p>
      </> : <><p className="room-call-welcome">Please take a seat.</p><p>Crisp will call you when it’s your turn.</p></>}
    </div>
    <div className="room-call-mascot"><Crisp size={260} state={voice.talkingId ? 'talking' : call ? 'pointing' : 'idle'} /></div>
    {call && <p className="room-call-caption">“{speech}”</p>}
    {soundEnabled === undefined && <button className="secondary room-sound" aria-pressed={sound} onClick={() => setSound(value => !value)}>{sound ? 'Disable sound' : 'Enable sound'}</button>}
    <p className="room-call-status" role="status">{voice.error || (voice.talkingId ? '🔊 speaking' : !connected ? 'Reconnecting to the waiting room…' : sound ? 'Call-outs play once.' : 'Enable sound to hear call-outs.')}</p>
    <HallwayCheckBack />
    <p className="room-hallway-note">Feeling worse? Please tell the front desk.</p>
  </aside>;
}
