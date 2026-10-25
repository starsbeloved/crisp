import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Alert, ProviderSource } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

type Description = { description: string; source: ProviderSource };
type FrameResult = Description | 'pending';
const consentText = 'Sends one alert frame to Google Gemini; not stored';
const Vision = createContext<{ synthetic: boolean; results: Record<string, FrameResult>; request: (id: string, retry?: boolean) => void }>({ synthetic: true, results: {}, request: () => {} });

/** One consent scope and one request per alert across the card and patient drawer. */
export function GeminiSeesProvider({ enabled, alerts, synthetic, children }: { enabled: boolean; alerts: Alert[]; synthetic: boolean; children: ReactNode }) {
  const requested = useRef(new Set<string>());
  const [results, setResults] = useState<Record<string, FrameResult>>({});
  const request = useCallback((id: string, retry = false) => {
    if (synthetic || (!retry && requested.current.has(id))) return;
    requested.current.add(id);
    setResults(current => ({ ...current, [id]: 'pending' }));
    void api.vision(id).catch((): Description => ({ description: 'Image description unavailable', source: 'template' }))
      .then(result => setResults(current => ({ ...current, [id]: result })));
  }, [synthetic]);
  useEffect(() => {
    if (enabled && !synthetic) alerts.filter(alert => alert.level === 'red' && alert.status === 'open').forEach(alert => request(alert.id));
  }, [enabled, alerts, synthetic, request]);
  return <Vision.Provider value={{ synthetic, results, request }}>{children}</Vision.Provider>;
}

export function GeminiSees({ alert }: { alert: Alert }) {
  const { synthetic, results, request } = useContext(Vision);
  if (alert.level !== 'red' || alert.status === 'checked') return null;
  const result = results[alert.id], pending = result === 'pending', description = result && result !== 'pending' ? result : null;
  return <section className="replay-player" aria-label="Alert frame description">
    {!synthetic && alert.replayFrames > 0 && <img src={api.replayUrl(alert.id, alert.replayFrames - 1)} alt="Recorded frame at the red request" />}
    <p role="status" aria-live="polite">{pending ? 'Looking at the alert frame…' : description ? <>
      {description.source === 'gemini' && <strong>✦ Gemini sees: </strong>}{description.description} <span className="tag">{description.source === 'gemini' ? 'Gemini' : 'Template'}</span>
    </> : synthetic ? 'SIMULATED · frame description unavailable' : null}</p>
    {!description || description.source === 'template' ? <>
      <small>{consentText}</small><button className="secondary" disabled={synthetic || pending} onClick={() => request(alert.id, true)}>{pending ? 'Describing frame…' : description ? 'Try describing frame again' : 'Describe frame'}</button>
    </> : null}
  </section>;
}
