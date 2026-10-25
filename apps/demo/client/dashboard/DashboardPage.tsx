import { useEffect, useState } from 'react';
import type { RoomState } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { useRoomState } from '../lib/useRoomState.ts';
import { SystemStrip } from './SystemStrip.tsx';
import { AlertBanner } from './AlertBanner.tsx';
import { VideoPanel } from './VideoPanel.tsx';
import { Queue } from './Queue.tsx';
import { PatientDrawer } from './PatientDrawer.tsx';
import { AskCrisp } from './AskCrisp.tsx';
import { demoFixture } from './fixture.ts';
import { useVoice } from './useVoice.ts';
import './dashboard.css';

export function DashboardPage() {
  const { state: live, connected } = useRoomState();
  const [now, setNow] = useState(Date.now()), [voice, setVoice] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [fixture, setFixture] = useState<RoomState | null>(null);
  const fixtureAllowed = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('fixture') === '1';
  const state = fixture ?? live, synthetic = fixture !== null;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const openAlerts = state?.alerts.filter(a => a.status === 'open' && state.visits.some(v => v.id === a.visitId && v.status === 'waiting')).sort((a, b) => Number(b.level === 'red') - Number(a.level === 'red') || a.openedAt - b.openedAt) ?? [];
  const audio = useVoice(voice, openAlerts.filter(a => a.explanation && (a.audio === 'ready' || a.audio === 'failed')).map(a => ({ key: `${a.id}:${a.updatedAt}`, id: a.id, url: a.audio === 'ready' ? api.alertAudioUrl(a.id) : null, speech: a.explanation!.speech })));
  async function perform(work: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed. Please try again.'); } finally { setBusy(false); }
  }
  function fixtureAction(kind: 'acknowledged' | 'checked', id: string) {
    setFixture(current => {
      if (!current) return current;
      const visitId = current.alerts.find(a => a.id === id)?.visitId;
      const vitals = visitId ? current.vitals[visitId] : undefined;
      return { ...current, alerts: current.alerts.map(a => a.id === id ? { ...a, status: kind, updatedAt: now, ...(kind === 'checked' ? { checkedAt: now } : { acknowledgedAt: now }) } : a),
        vitals: kind === 'checked' && vitals ? { ...current.vitals, [vitals.visitId]: { ...vitals, baselineHr: null, baselineRr: null, level: 'none' } } : current.vitals };
    });
  }
  const actions = {
    acknowledge: (id: string) => { if (synthetic) fixtureAction('acknowledged', id); else void perform(() => api.acknowledge(id)); },
    checked: (id: string) => { if (synthetic) fixtureAction('checked', id); else void perform(() => api.checked(id)); },
    call: (id: string, room: string) => {
      if (synthetic) { setFixture(current => current ? { ...current, visits: current.visits.map(v => v.id === id ? { ...v, status: 'called', room, calledAt: now } : v), handoffs: { ...current.handoffs, [id]: { visitId: id, text: 'SYNTHETIC · example handoff based on the illustrated check-in.', source: 'template', createdAt: now } } } : current); }
      else void perform(() => api.callIn(id, room));
    },
  };
  const selectedVisit = state?.visits.find(v => v.id === selected);
  return <div className="dashboard"><div className="page-heading"><div><p className="eyebrow">No one waits unseen</p><h1>Nurse dashboard</h1></div></div>
    {fixtureAllowed && <div className="fixture-controls"><button className="secondary" onClick={() => { setFixture(synthetic ? null : demoFixture()); setSelected(null); }}>{synthetic ? 'Return to live room' : 'Load demo fixture'}</button>{synthetic && <><strong className="synthetic-label">SYNTHETIC · illustrative data · actions stay in this preview</strong><button className="secondary" onClick={() => setFixture(current => current ? { ...current, alerts: demoFixture(now).alerts, vitals: demoFixture(now).vitals, serverNow: now } : current)}>Trigger synthetic request</button></>}</div>}
    <SystemStrip state={state} connected={connected} synthetic={synthetic} now={now} voice={voice} onVoice={() => setVoice(v => !v)} busy={busy} onReset={() => {
      if (!window.confirm(synthetic ? 'Reset this synthetic preview?' : 'Reset all demo visits, alerts, and camera state?')) return;
      if (synthetic) { setFixture(demoFixture()); setSelected(null); } else void perform(async () => { await api.reset(); setSelected(null); });
    }} />
    {(error || audio.error) && <p className="error-message" role="alert">{error || audio.error}</p>}
    <AlertBanner alert={openAlerts[0]} visit={state?.visits.find(v => v.id === openAlerts[0]?.visitId)} onAcknowledge={actions.acknowledge} busy={busy} />
    <div className="dashboard-columns"><div className="dashboard-left"><VideoPanel cameras={state?.cameras ?? {}} now={now} /><AskCrisp synthetic={synthetic} /></div>
      {state ? <Queue state={state} now={synthetic ? state.serverNow : now} onSelect={setSelected} actions={actions} busy={busy} talkingId={audio.talkingId} synthetic={synthetic} /> : <section className="panel"><h2>Waiting queue</h2><p>Connecting to the room…</p></section>}
    </div>
    {selectedVisit && state && <PatientDrawer key={selectedVisit.id} visit={selectedVisit} state={state} onClose={() => setSelected(null)} synthetic={synthetic} actions={actions} actionBusy={busy} />}
  </div>;
}
