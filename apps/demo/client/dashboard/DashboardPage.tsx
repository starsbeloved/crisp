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
import type { CommandResult } from '../../server/commands.ts';
import type { SuggestionState } from '../../server/proactive.ts';
import { useSuggestions } from '../staff/useSuggestions.ts';
import { Suggestions } from '../staff/Suggestions.tsx';
import { StaffToast } from '../staff/StaffToast.tsx';
import { normalizeRoom } from '../staff/rooms.ts';
import { staffRequest } from '../staff/tools.ts';
import { useAlertVoice, useMonitoringSound } from './useVoice.ts';
import './dashboard.css';

export function DashboardPage() {
  const { state: live, connected } = useRoomState();
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false);
  const monitoring = useMonitoringSound();
  const voice = monitoring.enabled;
  const [error, setError] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [fixture, setFixture] = useState<RoomState | null>(null);
  const fixtureAllowed = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('fixture') === '1';
  const state = fixture ?? live, synthetic = fixture !== null;
  const suggestions = useSuggestions(connected && !synthetic);
  const [notice, setNotice] = useState<(CommandResult & { key: string; speak: boolean }) | null>(null);
  const [spokenSuggestionIds, setSpokenSuggestionIds] = useState<string[]>([]);
  useEffect(() => {
    const notified = (event: Event) => { const id = (event as CustomEvent<{ spokenSuggestionId?: string }>).detail?.spokenSuggestionId; if (id) setSpokenSuggestionIds(ids => ids.includes(id) ? ids : [...ids, id]); };
    window.addEventListener('crisp-staff-change', notified);
    return () => window.removeEventListener('crisp-staff-change', notified);
  }, []);
  const [previewHidden, setPreviewHidden] = useState<string[]>([]);
  const preview: SuggestionState = { dispositions: {}, suggestions: fixture?.visits.some(v => v.status === 'waiting') && !previewHidden.includes('preview-room') ? [{ id: 'preview-room', kind: 'room_free', text: 'SYNTHETIC · Room 1 is free. Next by arrival is Ama (#2). Call them?', action: 'call', room: '1', visitId: 'synthetic-ama', createdAt: now }] : [] };
  const suggestionState = synthetic ? preview : suggestions.snapshot;
  function confirm(result: CommandResult, speak = true) { setNotice({ ...result, speak, key: `${Date.now()}:${Math.random()}` }); }

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const openAlerts = state?.alerts.filter(a => a.status === 'open' && state.visits.some(v => v.id === a.visitId && v.status === 'waiting')).sort((a, b) => Number(b.level === 'red') - Number(a.level === 'red') || a.openedAt - b.openedAt) ?? [];
  const audio = useAlertVoice(voice, state?.alerts.filter(a => a.status !== 'checked' && state.visits.some(v => v.id === a.visitId && v.status === 'waiting')) ?? [], [
    ...(notice && notice.speak && notice.message ? [{ key: notice.key, id: 'staff-confirmation', url: null, speech: notice.message }] : []),
    ...((synthetic || suggestions.ready) ? suggestionState.suggestions : []).filter(card => !spokenSuggestionIds.includes(card.id)).map(card => ({ key: `suggestion:${card.id}`, id: card.id, url: null, speech: `${synthetic ? 'Synthetic example. ' : ''}${card.text}` })),
  ], state?.visits.filter(v => synthetic || state.vitals[v.id]?.source === 'replay').map(v => v.id));
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
    remove: (id: string) => {
      if (synthetic) { setFixture(current => current ? { ...current, visits: current.visits.map(v => v.id === id ? { ...v, status: 'called', room: null } : v) } : current); return; }
      void perform(async () => {
        const response = await fetch(`/api/visits/${encodeURIComponent(id)}/remove`, { method: 'POST', signal: AbortSignal.timeout(4000) });
        const result: CommandResult = await response.json(); confirm(result, false);
        window.dispatchEvent(new Event('crisp-staff-change'));
      });
    },
    acknowledge: (id: string) => { if (synthetic) fixtureAction('acknowledged', id); else void perform(() => api.acknowledge(id)); },
    checked: (id: string) => { if (synthetic) fixtureAction('checked', id); else void perform(() => api.checked(id)); },
    call: (id: string, room: string) => {
      room = normalizeRoom(room);
      if (synthetic) { setFixture(current => current ? { ...current, visits: current.visits.map(v => v.id === id ? { ...v, status: 'called', room, calledAt: now } : v), handoffs: { ...current.handoffs, [id]: { visitId: id, text: 'SYNTHETIC · example handoff based on the illustrated check-in.', source: 'template', createdAt: now } } } : current); }
      else void perform(() => api.callIn(id, room));
    },
  };
  const selectedVisit = state?.visits.find(v => v.id === selected);
  return <div className="dashboard"><div className="page-heading"><div><p className="eyebrow">No one waits unseen</p><h1>Crisp Command Center</h1></div></div>
    {fixtureAllowed && <div className="fixture-controls"><button className="secondary" onClick={() => { setFixture(synthetic ? null : demoFixture()); setPreviewHidden([]); setSelected(null); }}>{synthetic ? 'Return to live room' : 'Load demo fixture'}</button>{synthetic && <><strong className="synthetic-label">SYNTHETIC · illustrative data · actions stay in this preview</strong><button className="secondary" onClick={() => setFixture(current => current ? { ...current, alerts: demoFixture(now).alerts, vitals: demoFixture(now).vitals, serverNow: now } : current)}>Trigger synthetic request</button></>}</div>}
    <SystemStrip state={state} connected={connected} synthetic={synthetic} now={now} voice={voice} onVoice={monitoring.toggle} onTestSound={monitoring.test} talking={Boolean(audio.talkingId)} busy={busy} onReset={() => {
      if (!window.confirm(synthetic ? 'Reset this synthetic preview?' : 'Reset all demo visits, alerts, and camera state?')) return;
      if (synthetic) { setFixture(demoFixture()); setSelected(null); confirm({ ok: true, message: 'Reset done · synthetic preview' }, false); }
      else void perform(async () => {
        const response = await fetch('/api/demo/reset', { method: 'POST', signal: AbortSignal.timeout(1000) });
        if (!response.ok) throw new Error('Reset not confirmed. Please retry.');
        await response.json(); setSelected(null); setSpokenSuggestionIds([]);
        confirm({ ok: true, message: 'Reset done' }, false);
        window.dispatchEvent(new Event('crisp-staff-change'));
      });
    }} />
    {(error || audio.error) && <p className="error-message" role="alert">{error || audio.error}</p>}
    <StaffToast result={notice} />
    <AlertBanner alert={openAlerts[0]} visit={state?.visits.find(v => v.id === openAlerts[0]?.visitId)} onAcknowledge={actions.acknowledge} busy={busy} />
    <div className="command-room-camera"><VideoPanel cameras={state?.cameras ?? {}} now={now} /></div>
    <Suggestions snapshot={suggestionState} ready={synthetic || suggestions.ready} busy={busy} synthetic={synthetic}
      onAccept={id => {
        if (synthetic) { setPreviewHidden(ids => [...ids, id]); actions.call('synthetic-ama', '1'); confirm({ ok: true, message: 'SYNTHETIC · Calling Ama to Room 1.' }); return; }
        void perform(async () => { const result = await staffRequest('accept_suggestion', { id }); confirm(result); window.dispatchEvent(new Event('crisp-staff-change')); });
      }}
      onDismiss={id => {
        if (synthetic) { setPreviewHidden(ids => [...ids, id]); confirm({ ok: true, message: 'SYNTHETIC · Not now.' }); return; }
        void perform(async () => { const response = await fetch('/api/suggestions/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(6000) }); confirm(await response.json()); window.dispatchEvent(new Event('crisp-staff-change')); });
      }} />
    <button type="button" className="secondary" disabled={!connected || synthetic || busy} onClick={() => { void perform(async () => { const result = await staffRequest('shift_summary', {}); confirm(result, !result.ok); window.dispatchEvent(new Event('crisp-staff-change')); }); }}>Summarize this shift</button>
    <div className="dashboard-columns"><div className="dashboard-left"><AskCrisp synthetic={synthetic} snapshot={{ state: live, connected }} /></div>
      {state ? <Queue state={state} now={synthetic ? state.serverNow : now} onSelect={setSelected} actions={actions} busy={busy} talkingId={audio.talkingId} synthetic={synthetic} /> : <section className="panel"><h2>Waiting queue</h2><p>Connecting to the room…</p></section>}
    </div>
    {selectedVisit && state && <PatientDrawer key={selectedVisit.id} visit={selectedVisit} state={state} onClose={() => setSelected(null)} synthetic={synthetic} actions={actions} actionBusy={busy} />}
  </div>;
}
