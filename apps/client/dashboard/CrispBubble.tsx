import { useState } from 'react';
import type { Alert, Vitals } from '../../shared/types.ts';
import { Crisp } from '../ui/Crisp.tsx';
import { ReplayPlayer } from './ReplayPlayer.tsx';
import { GeminiSees } from './GeminiSees.tsx';
import { sourceLabel } from './presentation.ts';
export function CrispBubble({ alert, vitals, talking, synthetic }: { alert: Alert; vitals?: Vitals; talking: boolean; synthetic: boolean }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const version = `${alert.id}:${alert.explanation?.bubble ?? ''}`;
  return <div className="bubble-slot">{dismissed !== version ? <aside className="crisp-bubble">
    <Crisp size={48} state={talking ? 'talking' : alert.explanation ? 'pointing' : 'thinking'} />
    <div><button className="dismiss secondary" aria-label="Dismiss Crisp explanation" onClick={() => setDismissed(version)}>×</button>
      <p>{alert.explanation?.bubble ?? 'Crisp is summarizing…'}</p>
      {alert.explanation && <small className="tag">{sourceLabel(alert.explanation.source)}</small>}
      <GeminiSees alert={alert} />
      {alert.replayFrames > 0 && <details><summary>View replay</summary><ReplayPlayer alert={alert} vitals={vitals} synthetic={synthetic} /></details>}
    </div>
  </aside> : <button className="secondary" onClick={() => setDismissed(null)}>Show Crisp explanation</button>}</div>;
}
