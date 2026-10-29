import { useEffect, useState } from 'react';
import type { WaitTimeBoardData } from '../../server/waittime.ts';
import './lobby.css';

/** Shared by public lobby and hallway surfaces; contains only public queue fields. */
export function WaitTimeBoard({ refreshKey = '' }: { refreshKey?: string }) {
  const [board, setBoard] = useState<WaitTimeBoardData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let controller: AbortController;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch('/api/waittime', { signal: request.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Wait-time board unavailable');
        const data: WaitTimeBoardData = await response.json();
        if (!request.signal.aborted) { setBoard(data); setFailed(false); }
      } catch {
        if (!request.signal.aborted) { setBoard(null); setFailed(true); }
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { clearInterval(timer); controller?.abort(); };
  }, [refreshKey]);

  return <section className="lobby-waittime" aria-label="Wait-time estimates">
    <h2>While you wait</h2>
    <p className="lobby-estimate-label">Estimate — the nurse may call people in a different order</p>
    {board ? <>
      {board.waiting.length ? <ol aria-label="Waiting patients">{board.waiting.map(visit => <li key={visit.queueNo}>
        <span className="lobby-waittime-code">#{visit.queueNo} · {visit.initial}</span>
        <span className="lobby-waittime-position">{visit.peopleAhead === 1 ? '1 person ahead' : `${visit.peopleAhead} people ahead`}</span>
        <span className="lobby-waittime-minutes">about {visit.minutes} min</span>
      </li>)}</ol> : <p className="lobby-waittime-status">No one is waiting right now.</p>}
      {board.usingFallback && board.waiting.length > 0 && <p className="lobby-waittime-note">Early estimate: using 12 min between call-ins until two are recorded.</p>}
    </> : <p className="lobby-waittime-status" role="status">{failed ? 'Estimates unavailable. Please ask the front desk.' : 'Loading estimates…'}</p>}
  </section>;
}
