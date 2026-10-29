import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { stationLabel, type StationPresence } from './model.ts';

/** Also exported for the Command Center's next iteration of SystemStrip. */
export function StationStatus() {
  const [stations, setStations] = useState<StationPresence[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch('/api/stations', { signal: controller.signal });
        if (!response.ok) throw new Error('Stations unavailable');
        const result: { stations: StationPresence[] } = await response.json();
        if (!controller.signal.aborted) { setStations(result.stations); setUnavailable(false); }
      } catch { if (!controller.signal.aborted) { setStations(null); setUnavailable(true); } }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 10_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <section className="station-status" aria-label="Stations">
    <strong>Stations</strong>
    {unavailable ? <span>Station status unavailable</span> : stations === null ? <span>Loading stations…</span> : stations.length === 0 ? <span>No stations registered</span> : stations.map(station => <span key={station.id}>{station.name} · {stationLabel(station)} · {station.online && Date.now() - station.lastSeenAt < 30_000 ? 'online' : 'offline'}</span>)}
  </section>;
}

/** Keep dashboard files owned by P13a untouched. */
export function SystemStations() {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => { setTarget(document.querySelector('.system-popover')); }, []);
  return target ? createPortal(<StationStatus />, target) : null;
}
