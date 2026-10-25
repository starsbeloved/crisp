import type { RoomState } from '../../shared/types.ts';

export function SystemStrip({ state, connected, now, voice, onVoice, onTestSound, talking, geminiVision, onGeminiVision, onReset, busy, synthetic = false }: {
  state: RoomState | null; connected: boolean; now: number; voice: boolean; onVoice: () => void; onTestSound: () => void; talking: boolean; geminiVision: boolean; onGeminiVision: (enabled: boolean) => void; onReset: () => void; busy: boolean; synthetic?: boolean;
}) {
  const cameras = Object.values(state?.cameras ?? {}).filter(camera => now - camera.lastFrameAt < 60_000 && camera.cameraId.toLowerCase() !== 'synthetic');
  const paused = cameras.some(camera => !camera.visible);
  return <section className="system-strip" aria-label="System status">
    <span className={`system-summary ${paused ? 'paused' : 'good'}`} role="status"><i aria-hidden="true" />{paused ? 'Camera paused' : 'All systems normal'}</span>
    {cameras.filter(camera => !camera.visible).map(camera => <strong className="camera-warning" key={camera.cameraId}>Camera window hidden — processing may pause</strong>)}
    <div className="strip-actions"><button aria-pressed={voice} onClick={onVoice}>{voice ? 'Monitoring · sound on' : 'Start monitoring (sound on)'}</button><button className="secondary" onClick={onTestSound}>Test alert sound</button>{talking && <span role="status" aria-live="polite">🔊 speaking</span>}
      <details className="system-details"><summary>System</summary><div className="system-popover">
        <span>{synthetic ? 'SYNTHETIC preview' : `SSE · ${connected ? 'Connected' : 'Reconnecting…'}`}</span>
        {cameras.map(camera => <span key={camera.cameraId}>Camera {camera.cameraId} · {camera.fps.toFixed(1)} fps · {Math.max(0, (now - camera.lastFrameAt) / 1000).toFixed(1)} s ago{now - camera.lastFrameAt > 2000 && ' · STALE'}</span>)}
        <span>Gemini · {state?.providers.gemini ? 'Configured' : 'Template'}</span>
        <span>ElevenLabs · {state?.providers.elevenlabs ? 'Configured' : 'Browser voice'}</span>
        <label className="system-vision-toggle"><input type="checkbox" checked={geminiVision} onChange={event => onGeminiVision(event.target.checked)} /> Gemini sees alert frame (opt in)</label>
        <span>Agent · {state?.providers.agent ? 'Configured' : 'Unavailable'}</span>
      </div></details>
      <button className="secondary" disabled={busy || !state} onClick={onReset}>Reset demo</button></div>
  </section>;
}
