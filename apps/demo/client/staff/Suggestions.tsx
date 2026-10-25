import type { SuggestionState } from '../../server/proactive.ts';
import './staff.css';
export function Suggestions({ snapshot, ready, busy, onAccept, onDismiss, synthetic = false }: {
  snapshot: SuggestionState; ready: boolean; busy: boolean; onAccept: (id: string) => void; onDismiss: (id: string) => void; synthetic?: boolean;
}) {
  return <section aria-label="Crisp suggestions" className="panel staff-suggestions">
    <h2>Crisp noticed</h2><p>Crisp proposes. You confirm. Arrival order only; no clinical ranking.</p>
    {!ready && <p role="status">Suggestions disconnected or updating · actions paused.</p>}
    {synthetic && <strong>SYNTHETIC · preview suggestions; actions stay in this preview.</strong>}
    {!snapshot.suggestions.length && ready && <p>No new suggestions.</p>}
    <div className="staff-suggestion-list">{[...snapshot.suggestions].reverse().map(card => <article className="staff-suggestion" key={card.id}>
      <small>{card.kind.replaceAll('_', ' ')}{card.source ? ` · ${card.source === 'gemini' ? 'Gemini' : 'Template'}` : ''}</small>
      <p>{card.text}</p><div className="staff-suggestion-actions">
        <button disabled={!ready || busy} onClick={() => onAccept(card.id)}>Yes</button>
        <button className="secondary" disabled={!ready || busy} onClick={() => onDismiss(card.id)}>Not now</button>
      </div>
    </article>)}</div>
    {Object.keys(snapshot.dispositions).length > 0 && <details className="staff-dispositions"><summary>Completed / left · records retained</summary>
      {Object.entries(snapshot.dispositions).map(([id, entry]) => <p key={id}>#{entry.queueNo} · {entry.name} — {entry.status === 'done' ? 'Patient done' : 'Left · staff confirmed'}</p>)}
    </details>}
  </section>;
}
