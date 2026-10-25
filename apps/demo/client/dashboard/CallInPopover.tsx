import { useState } from 'react';
export function CallInPopover({ onCall, busy }: { onCall: (room: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="call-in"><button className="secondary" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>Call in</button>
    {open && <div className="room-picker" role="group" aria-label="Choose room">{[1, 2, 3].map(n => <button disabled={busy} key={n} onClick={() => { onCall(`Room ${n}`); setOpen(false); }}>Room {n}</button>)}<button className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>}
  </div>;
}
