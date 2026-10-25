import { CheckInPage } from './checkin/CheckInPage.tsx';
import { CameraPage } from './camera/CameraPage.tsx';
import { DashboardPage } from './dashboard/DashboardPage.tsx';
import { LobbyPage } from './lobby/LobbyPage.tsx';
const links = [['/check-in', 'Check in'], ['/camera', 'Room camera'], ['/dashboard', 'Nurse dashboard'], ['/lobby', 'Lobby']];
export function App() {
  const path = location.pathname;
  return <><header><a href="/" className="wordmark">Crisp</a><nav aria-label="Demo pages">{links.map(([url, title]) => <a href={url} key={url} aria-current={path === url ? 'page' : undefined}>{title}</a>)}</nav></header><main>
    {path === '/check-in' ? <CheckInPage /> : path === '/camera' ? <CameraPage /> : path === '/dashboard' ? <DashboardPage /> : path === '/lobby' ? <LobbyPage /> : <><h1>No one waits unseen.</h1><p>Crisp — Waiting Room Companion · P0 skeleton</p><div className="launcher">{links.map(([url, title]) => <a className="card" href={url} key={url}>{title} →</a>)}</div><p>Use separate, tiled windows to keep camera processing active.</p></>}
  </main></>;
}
