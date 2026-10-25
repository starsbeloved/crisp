import { useRoomState } from '../lib/useRoomState.ts';
import { Card } from '../ui/Card.tsx';
import { Crisp } from '../ui/Crisp.tsx';
export function LobbyPage() {
  const { state, connected } = useRoomState();
  return <><h1>Waiting room</h1><p>{connected ? 'Connected' : 'Connecting…'}</p><Card><Crisp /><h2>Please take a seat</h2>
    {state?.nowCalling && <p>Now calling: {state.nowCalling.name} — Room {state.nowCalling.room}</p>}
    <ol className="queue">{state?.visits.filter(visit => visit.status === 'waiting').map(visit => <li key={visit.id}><strong>#{visit.queueNo} · {visit.name.trim().charAt(0)}.</strong></li>)}</ol>
    {!state?.visits.some(v => v.status === 'waiting') && <p>No one is waiting yet.</p>}
  </Card></>;
}
