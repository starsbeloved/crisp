import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { Card } from '../ui/Card.tsx';
import { Chip } from '../ui/Chip.tsx';
import { AskCrispVoice } from './AskCrispVoice.tsx';
export function DashboardPage() {
  const { state, connected } = useRoomState();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <><h1>Nurse dashboard</h1><p>{connected ? 'Connected' : 'Connecting…'} · Camera estimates</p><AskCrispVoice /><div className="columns"><Card><h2>Room cameras</h2>
    {Object.values(state?.cameras ?? {}).map(camera => <div key={camera.cameraId}>
      <h3>Camera {camera.cameraId} <Chip>{camera.source === 'replay' ? 'REPLAY' : 'LIVE'}</Chip> <Chip>{now - camera.lastFrameAt > 2000 ? 'STALE' : `${camera.fps.toFixed(1)} fps`}</Chip></h3>
      {!camera.visible && <p role="status">Camera window hidden — processing may pause</p>}
      <img className="stream" src={api.streamUrl(camera.cameraId)} alt={`Camera ${camera.cameraId} ${camera.source === 'replay' ? 'REPLAY' : 'LIVE'} stream`} />
    </div>)}{!Object.keys(state?.cameras ?? {}).length && <p>Waiting for a camera stream. Open the room camera in a separate window.</p>}
  </Card><Card><h2>Waiting queue</h2><ol className="queue">{state?.visits.filter(v => v.status === 'waiting').map(visit => <li key={visit.id}><strong>#{visit.queueNo} · {visit.name}</strong><p>{visit.summary?.text ?? 'Summary pending…'}</p><span>♥ {state.vitals[visit.id]?.hrBpm ?? 'measuring…'} · Breathing {state.vitals[visit.id]?.rrBpm ?? 'measuring…'}</span></li>)}</ol>{!state?.visits.some(v => v.status === 'waiting') && <p>No one is waiting yet.</p>}</Card></div></>;
}
