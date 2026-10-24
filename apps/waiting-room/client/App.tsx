import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { DashboardView } from './ui/dashboard/DashboardView.tsx';
import { makeDashboardFixtures } from '../shared/dashboard-fixtures.tsx';
import type { FixtureAction } from '../shared/dashboard-fixtures.tsx';
import { api } from './runtime/api.ts';
import { PhoneRoute } from './phone/PhoneRoute.tsx';
import { StaffPage } from './staff/StaffPage.tsx';
import { CheckInPage } from './check-in/CheckInPage.tsx';
import { PatientPage } from './patient/PatientPage.tsx';
import { VisionRoute } from './vision/VisionRoute.tsx';
import { StationVisionProvider } from './vision/StationVisionProvider.tsx';
function AtomGallery() {
  return <section aria-label="Atom vocabulary gallery" className="wr-atom-gallery"><strong>Display vocabulary · synthetic</strong><span className="wr-badge wr-tone-warning">Identity uncertain</span><span className="wr-provenance wr-tone-neutral">Synthetic fixture</span></section>;
}
function FixtureGallery() {
  const [actionCount, setActionCount] = useState(0);
  const [lastAction, setLastAction] = useState('No callback invoked');
  const [selection, setSelection] = useState<{ patientId: string|null; requestId: string|null }|null>(null);
  const callbacks = useMemo(() => (event: FixtureAction) => {
    setActionCount(count => count + 1);
    setLastAction(`${event.action}${event.id ? `: ${event.id}` : ''} · synthetic callback only; no action saved`);
    if (event.action === 'selectPatient') setSelection({ patientId: event.id ?? null, requestId: null });
    if (event.action === 'selectRequest') setSelection({ patientId: null, requestId: event.id ?? null });
  }, []);
  const fixtures = useMemo(() => makeDashboardFixtures(callbacks), [callbacks]);
  const [name, setName] = useState(() => { const requested = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('fixture'); return requested && requested in fixtures ? requested : 'openRequestRoom'; });
  const base = fixtures[name];
  const patientId = selection ? selection.requestId ? base.requests.find(r => r.id === selection.requestId)?.patientId ?? null : selection.patientId : base.selectedPatientId;
  const props = { ...base, selectedPatientId: patientId, selectedRequestId: selection?.requestId ?? base.selectedRequestId };
  return <><section className="wr-gallery-toolbar" aria-label="Synthetic fixture controls"><strong className="wr-gallery-warning">Synthetic fixture · no live sensing or providers</strong><label>Fixture <select value={name} onChange={e => { setName(e.target.value); setSelection(null); setLastAction('No callback invoked'); setActionCount(0); }}>{Object.keys(fixtures).map(key => <option key={key}>{key}</option>)}</select></label><output aria-label="Last fixture callback">Invocation count: {actionCount} · {lastAction}</output></section><AtomGallery/><DashboardView {...props}/></>;
}
function StationShell() {
  const [mode, setMode] = useState('Monitor');
  const [status, setStatus] = useState('Service not checked; station not started');
  const [pending, setPending] = useState(false);
  const act = async (action: 'health'|'station') => {
    setPending(true);
    try { if (action === 'health') { const health = await api.health(); setStatus(`Local service reachable · server time ${new Date(health.serverNowMs).toISOString()}`); } else { await api.startStation(); setStatus('Local station session initialized · synthetic preview only'); } }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Local service unavailable'); }
    finally { setPending(false); }
  };
  return <><nav className="wr-gallery-toolbar" aria-label="Station modes">{['Check in','Monitor','Demo setup'].map(item => <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item}</button>)}<button disabled={pending} onClick={() => void act('health')}>Check local service</button><button disabled={pending} onClick={() => void act('station')}>Start local station</button><output aria-live="polite">{status}</output></nav>{mode === 'Monitor' ? <FixtureGallery/> : <main><h1>{mode}</h1><p>Foundation skeleton — Not implemented. No acquisition has started.</p><p>{mode === 'Check in' ? 'Visit, face enrollment, original questions and paired phone capture will be integrated in later slices.' : 'Device, model and secure phone configuration remain unverified. No real scenario control is connected.'}</p><a href="/phone">Phone PPG skeleton</a> · <a href="/questionnaire">Text questionnaire skeleton</a></main>}</>;
}
function Page({pathname}:{pathname:string}) {
  if (pathname === '/check-in') return <CheckInPage/>;
  if (pathname === '/patient') return <PatientPage/>;
  if (pathname === '/staff') return <StaffPage/>;
  if (pathname === '/vision') return <VisionRoute/>;
  if (pathname === '/' || pathname === '/station') return <main className="wr-welcome"><p className="wr-eyebrow">WAITING ROOM · SUPERVISED PROTOTYPE</p><h1>A clearer view.<br/>A human response.</h1><p>Three workspaces, one patient journey. Measurements and identity stay unavailable until genuinely acquired.</p><nav className="wr-launcher" aria-label="Demo workspaces"><a href="/check-in"><strong>01 · Patient check-in</strong><span>Create a visit, answer questions and pair a phone.</span></a><a href="/vision"><strong>02 · Room vision</strong><span>Manage the foreground webcam and view tracking status.</span></a><a href="/staff"><strong>03 · Nurse dashboard</strong><span>Review saved visits, evidence and check requests.</span></a></nav><p className="wr-caption">One laptop: use check-in, then monitoring. Remote laptops and phone HTTPS are not configured automatically. This prototype is not medical triage.</p><a href="/gallery">Open labeled synthetic UI gallery</a></main>;
  if (pathname === '/gallery') return <StationShell/>;
  if (pathname === '/phone') return <PhoneRoute/>;
  if (pathname === '/questionnaire') return <PatientPage/>;
  return <main><h1>Page not found</h1><a href="/station">Open station preview</a></main>;
}
const operatorRoutes=new Set(['/','/station','/check-in','/vision','/staff','/gallery']);
/** Keep the face-session document owner alive during the one-laptop workflow. */
export function App({pathname}:{pathname?:string}={}) {
  const [currentPath,setPath]=useState(()=>typeof window==='undefined'?'/':window.location.pathname);
  const path=pathname??currentPath;
  const page=useRef<HTMLDivElement>(null),previousPath=useRef(path);
  useEffect(()=>{const pop=()=>setPath(window.location.pathname);window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  useEffect(()=>{
    if(previousPath.current===path)return;
    previousPath.current=path;
    const heading=page.current?.querySelector<HTMLElement>('h1');
    if(heading){heading.tabIndex=-1;heading.focus();}
    // New views start at their heading; the face-session owner stays mounted.
    if(page.current?.scrollIntoView)page.current.scrollIntoView({block:'start',behavior:'instant'});
  },[path]);
  function navigate(event:MouseEvent<HTMLDivElement>){
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!(event.target instanceof Element))return;
    const anchor=event.target.closest('a');if(!anchor||anchor.download||anchor.target&&anchor.target!=='_self')return;
    const url=new URL(anchor.href,window.location.href);
    if(url.origin!==window.location.origin||!operatorRoutes.has(url.pathname)||url.hash)return;
    event.preventDefault();window.history.pushState(null,'',url.pathname+url.search);setPath(url.pathname);
  }
  return <StationVisionProvider><div ref={page} onClick={navigate}><Page pathname={path}/></div></StationVisionProvider>;
}
