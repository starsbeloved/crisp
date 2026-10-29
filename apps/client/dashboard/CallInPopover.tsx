import { useEffect, useId, useRef, useState } from 'react';
export function CallInPopover({ onCall, busy }: { onCall: (room: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), picker = useRef<HTMLDivElement>(null), id = useId();
  function dismiss() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    picker.current?.querySelector('button')?.focus();
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    }
    window.addEventListener('keydown', escape);
    window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('pointerdown', outside); };
  }, [open]);
  return <div className="call-in"><button ref={trigger} className="secondary" aria-expanded={open} aria-controls={open ? id : undefined} disabled={busy} onClick={() => setOpen(!open)}>Call in</button>
    {open && <div ref={picker} id={id} className="room-picker" role="group" aria-label="Choose room">{[1, 2, 3].map(n => <button disabled={busy} key={n} onClick={() => { onCall(`Room ${n}`); dismiss(); }}>Room {n}</button>)}<button className="secondary" onClick={dismiss}>Cancel</button></div>}
  </div>;
}
