import { useLayoutEffect, useRef } from 'react';
import type { RoomState } from '../../shared/types.ts';
import { QueueRow, type QueueActions } from './QueueRow.tsx';
import { activeAlert, waitingQueue } from './presentation.ts';
export function Queue({ state, now, onSelect, actions, busy, talkingId, synthetic }: {
  state: RoomState; now: number; onSelect: (id: string) => void; actions: QueueActions; busy: boolean; talkingId: string | null; synthetic: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), positions = useRef(new Map<string, number>());
  const visits = waitingQueue(state), order = visits.map(v => v.id).join('|');
  useLayoutEffect(() => {
    const rows = root.current?.querySelectorAll<HTMLElement>('[data-visit-id]');
    const parentTop = root.current?.getBoundingClientRect().top ?? 0;
    rows?.forEach(row => { const id = row.dataset.visitId!, top = row.getBoundingClientRect().top - parentTop, previous = positions.current.get(id);
      if (previous !== undefined && previous !== top && !matchMedia('(prefers-reduced-motion: reduce)').matches) row.animate([{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }], { duration: 400, easing: 'ease-out' });
      positions.current.set(id, top);
    });
  }, [order]);
  const called = state.visits.filter(v => v.status === 'called');
  return <section className="panel queue-panel"><div className="section-heading"><h2>Waiting room · {visits.length} waiting</h2></div>
    <p className="queue-help">People who may need a check appear first; everyone else in check-in order.</p>
    <div ref={root} className="patient-list">{visits.map(visit => { const alert = activeAlert(state, visit.id); return <QueueRow key={visit.id} visit={visit} vitals={state.vitals[visit.id]} alert={alert} now={now} onSelect={() => onSelect(visit.id)} actions={actions} busy={busy} talking={talkingId === alert?.id} synthetic={synthetic} />; })}</div>
    {!visits.length && <p>No one is waiting yet.</p>}
    {called.length > 0 && <details className="called-list"><summary>With clinician · {called.length}</summary>{called.map(v => <button className="patient-select" key={v.id} onClick={() => onSelect(v.id)}>#{v.queueNo} · {v.name} — {v.room}</button>)}</details>}
  </section>;
}
