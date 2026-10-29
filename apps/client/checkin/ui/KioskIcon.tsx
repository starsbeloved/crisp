export function KioskIcon({ name }: { name: 'mic' | 'info' | 'apple' }) {
  if (name === 'apple') return <svg className="checkin-apple" width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 9c-2-2-8-2-10 3-2 6 1 14 6 15 2 .4 3-.6 4-.6s2 1 4 .6c5-1 8-9 6-15-2-5-8-5-10-3z" fill="var(--c-red)" />
    <path d="M16 9c0-2 .5-4 2-5.5" stroke="var(--c-text)" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M17.5 6c2-3 6-3.5 8-2.5-1.5 3-5.5 3.5-8 2.5z" fill="var(--c-leaf)" />
  </svg>;
  return <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {name === 'mic' ? <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>}
  </svg>;
}
