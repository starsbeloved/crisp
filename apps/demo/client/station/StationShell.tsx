import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Crisp } from '../ui/Crisp.tsx';
import { loadProfile, saveProfile, selectionFromLocation, stationChoices, type StationSelection } from './model.ts';
import { stationUrl } from './model.ts';
import { SystemStations } from './StationStatus.tsx';
import './station.css';

const navigatePage = (href: string) => window.location.assign(href);

export function StationShell({ path, children, navigate = navigatePage }: { path: string; children: ReactNode; navigate?: (href: string) => void }) {
  const [profile] = useState(loadProfile);
  const [name, setName] = useState(profile.name);
  const [remembered, setRemembered] = useState(true);
  const [registration, setRegistration] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const picker = path === '/station';
  const explicitPicker = new URLSearchParams(location.search).get('choose') === '1';
  const selection = selectionFromLocation(path, location.search);
  const role = selection?.role, room = selection?.role === 'exam' ? selection.room : undefined;
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const switchRole = () => navigate('/station?choose=1');

  useEffect(() => {
    setRemembered(saveProfile({ ...profile, selection: selection ?? profile.selection }));
    if (picker && !explicitPicker && profile.selection) navigate(stationUrl(profile.selection));
  }, [path, room, picker, explicitPicker, profile, navigate]);

  useEffect(() => {
    if (!role) return;
    const controller = new AbortController();
    async function heartbeat() {
      try {
        const response = await fetch('/api/stations', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: profile.id, name: profile.name, role, ...(room ? { room } : {}) }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Registration unavailable');
        if (!controller.signal.aborted) setRegistration('online');
      } catch { if (!controller.signal.aborted) setRegistration('offline'); }
    }
    void heartbeat(); const timer = setInterval(() => void heartbeat(), 10_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [role, room, profile]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      if (event.shiftKey && event.key.toLowerCase() === 's' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); navigate('/station?choose=1');
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('keydown', shortcut); clearTimeout(hold.current); };
  }, [navigate]);

  function choose(next: StationSelection) {
    saveProfile({ ...profile, name: name.trim() || profile.name, selection: next });
    // A document navigation tears down cameras, pending media requests, and voice sessions.
    navigate(stationUrl(next));
  }
  if (picker) return <main className="station-picker">
    <div className="station-heading"><Crisp state="happy" size={120} /><div><p className="station-eyebrow">Crisp · station setup</p><h1>What is this screen?</h1><p>Choose a role for this laptop. Switch whenever you need.</p></div></div>
    <label className="station-name">Laptop name<input value={name} maxLength={60} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
    <div className="station-choices">{stationChoices.map(({ selection, label, description }, index) => <button className="station-choice" key={label} onClick={() => choose(selection)}><span className="station-number" aria-hidden="true">0{index + 1}</span><strong>{label}</strong><span>{description}</span><span className="station-arrow" aria-hidden="true">↗</span></button>)}</div>
    <p className="station-hint">{remembered ? 'This browser remembers your role.' : 'Browser storage is unavailable. Choose a role again when reopening.'} Hold the bottom-left corner for 2 seconds or press <kbd>Shift</kbd> + <kbd>S</kbd> to switch.</p>
  </main>;

  return <>{children}{path === '/dashboard' && <SystemStations />}
    <button className="station-corner" aria-label="Switch station role" title={`Hold for 2 seconds or press Shift+S to switch role${role ? ` · Station ${registration === 'online' ? 'registered' : registration === 'offline' ? 'registration unavailable' : 'connecting'}` : ''}`}
      onPointerDown={event => { if (event.button !== 0) return; clearTimeout(hold.current); hold.current = setTimeout(switchRole, 2000); }}
      onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)} onPointerCancel={() => clearTimeout(hold.current)} onBlur={() => clearTimeout(hold.current)}
      onClick={event => { if (event.detail === 0) switchRole(); }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
    </button>
  </>;
}
