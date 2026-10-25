import { lazy, Suspense, type ComponentType } from 'react';
import { CheckInPage } from './checkin/CheckInPage.tsx';
import { CameraPage } from './camera/CameraPage.tsx';
import { DashboardPage } from './dashboard/DashboardPage.tsx';
import { LobbyPage } from './lobby/LobbyPage.tsx';
import { StationShell } from './station/StationShell.tsx';

// Parallel packets supply these pages. Glob keeps this packet runnable before merge.
const roomModule = import.meta.glob<{ RoomPage: ComponentType }>('./room/RoomPage.tsx')['./room/RoomPage.tsx'];
const examModule = import.meta.glob<{ ExamPage: ComponentType }>('./exam/ExamPage.tsx')['./exam/ExamPage.tsx'];
const RoomPage = roomModule ? lazy(async () => ({ default: (await roomModule()).RoomPage })) : null;
const ExamPage = examModule ? lazy(async () => ({ default: (await examModule()).ExamPage })) : null;

const links = [
  ['/check-in', 'Check in', 'A calm, guided start for people arriving at the clinic.'],
  ['/camera', 'Room camera', 'See the live room view and camera estimate status.'],
  ['/dashboard', 'Crisp Command Center', 'Review the waiting room and requests for a check.'],
  ['/lobby', 'Lobby', 'A clear, friendly display for the waiting room.'],
  ['/station?choose=1', 'Choose station', 'Give this laptop a role, and switch whenever you need.'],
] as const;

function AppleMark() {
  return <svg className="apple-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 9c-2-2-8-2-10 3-2 6 1 14 6 15 2 .4 3-.6 4-.6s2 1 4 .6c5-1 8-9 6-15-2-5-8-5-10-3z" fill="var(--c-red)" /><path d="M16 9c0-2 .5-4 2-5.5" stroke="var(--c-text)" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M17.5 6c2-3 6-3.5 8-2.5-1.5 3-5.5 3.5-8 2.5z" fill="var(--c-leaf)" /></svg>;
}

export function App() {
  const path = location.pathname;
  const lobby = path === '/lobby';
  return <StationShell path={path}>
    {!lobby && <header><a href="/" className="wordmark"><AppleMark /><span>Crisp</span></a><nav aria-label="Demo pages">{links.map(([url, title]) => <a href={url} key={url} aria-current={path === url ? 'page' : undefined}>{title}</a>)}</nav></header>}
    <main className={lobby ? 'app-main-lobby' : undefined}>
      {path === '/check-in' ? <CheckInPage /> : path === '/camera' ? <CameraPage /> : path === '/dashboard' ? <DashboardPage /> : path === '/lobby' ? <LobbyPage /> : path === '/room' ? <Suspense fallback={<p>Opening Room view…</p>}>{RoomPage ? <RoomPage /> : <section className="card"><h1>Room view is unavailable in this build.</h1><a href="/camera">Open room camera</a></section>}</Suspense> : path === '/exam' ? <Suspense fallback={<p>Opening Exam room…</p>}>{ExamPage ? <ExamPage /> : <section className="card"><h1>Exam room is unavailable in this build.</h1><a href="/station?choose=1">Choose another station</a></section>}</Suspense> : <>
        <section className="launcher-hero"><p className="launcher-kicker"><AppleMark /> Waiting room companion</p><h1>No one waits unseen.</h1><p className="launcher-intro">Crisp helps people check in, helps staff see the room, and keeps everyone informed while they wait.</p></section>
        <div className="launcher">{links.map(([url, title, description]) => <a className="card launcher-card" href={url} key={url}><strong>{title}</strong><span>{description}</span><span className="launcher-arrow" aria-hidden="true">→</span></a>)}</div>
        <p className="launcher-note">Use separate, tiled windows to keep camera processing active.</p>
      </>}
    </main>
  </StationShell>;
}
