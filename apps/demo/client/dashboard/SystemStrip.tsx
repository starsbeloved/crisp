import type { RoomState } from '../../shared/types.ts';

export function SystemStrip({ state, connected, now, voice, onVoice, onReset, busy }: {
  state: RoomState | null; connected: boolean; now: number; voice: boolean; onVoice: () => void; onReset: () => void; busy: boolean;
}) {
  return <section className="system-strip" aria-label="System status">
    <span className={`status ${connected ? 'good' : 'low'}`}>SSE · {connected ? 'Connected' : 'Reconnecting…'}</span>
    {Object.values(state?.cameras ?? {}).map(c => <span key={c.cameraId} className="camera-health">
      <span className={`status ${now - c.lastFrameAt > 2000 ? 'low' : 'good'}`}>Camera {c.cameraId} · {c.fps.toFixed(1)} fps · {Math.max(0, (now - c.lastFrameAt) / 1000).toFixed(1)} s ago{now - c.lastFrameAt > 2000 && ' · STALE'}</span>
      {!c.visible && <strong className="warning">Camera window hidden — processing may pause</strong>}
    </span>)}
    <span>Gemini · {state?.providers.gemini ? 'Configured' : 'Template'}</span>
    <span>ElevenLabs · {state?.providers.elevenlabs ? 'Configured' : 'Browser voice'}</span>
    <span>Agent · {state?.providers.agent ? 'Configured' : 'Unavailable'}</span>
    <div className="strip-actions"><button aria-pressed={voice} onClick={onVoice}>{voice ? 'Disable voice' : 'Enable voice'}</button>
      <button className="secondary" disabled={busy || !state} onClick={onReset}>Reset demo</button></div>
  </section>;
}
