import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Alert, NowCalling } from '../../shared/types.ts';
import { NowCallingPanel } from './NowCallingPanel.tsx';
import { useAlertVoice, useMonitoringSound } from '../dashboard/useVoice.ts';
import './room.css';

export function RoomView({ call, connected, children, alerts = [], replayVisitIds = [] }: { call: NowCalling | null; connected: boolean; children: ReactNode; alerts?: Alert[]; replayVisitIds?: string[] }) {
  const room = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const monitoring = useMonitoringSound();
  const voice = useAlertVoice(monitoring.enabled, alerts, [], replayVisitIds);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = room.current;
    document.body.style.overflow = 'hidden';
    heading.current?.focus();
    const changed = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function toggleFullscreen() {
    setError('');
    try {
      if (document.fullscreenElement === room.current) await document.exitFullscreen();
      else if (room.current?.requestFullscreen) await room.current.requestFullscreen();
      else throw new Error('Fullscreen unavailable');
    } catch { setError('Use your browser’s fullscreen command to fill this screen.'); }
  }

  return <div className="room-view" ref={room}>
    <div className="room-toolbar">
      <div><p className="room-eyebrow">Crisp · waiting room companion</p><h1 ref={heading} tabIndex={-1}>Room view</h1></div>
      <div className="room-toolbar-actions"><button aria-pressed={monitoring.enabled} onClick={monitoring.toggle}>{monitoring.enabled ? 'Monitoring · sound on' : 'Start monitoring (sound on)'}</button><a className="room-stations-link" href="/station?choose=1" title="Stations · Shift+S">Stations</a><a href="/camera">Camera only</a><button className="secondary" aria-pressed={fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button></div>
    </div>
    {error && <p className="room-fullscreen-error" role="status">{error}</p>}{voice.talkingId && <p role="status">🔊 speaking</p>}
    {voice.error && <p role="status">{voice.error}</p>}
    <div className="room-layout"><section className="room-camera" aria-label="This computer’s room camera">{children}</section><NowCallingPanel call={call} connected={connected} soundEnabled={monitoring.enabled} /></div>
  </div>;
}
