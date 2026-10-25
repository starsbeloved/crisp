import { useRef, useState } from 'react';
import type { CommandResult } from '../../server/commands.ts';
import { StaffToast } from './StaffToast.tsx';
export function PatientDone({ room, visitId, connected }: { room: string; visitId?: string; connected: boolean }) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState<CommandResult | null>(null);
  const pending = useRef(false);
  async function done() {
    if (!visitId || !connected || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const response = await fetch('/api/exam/patient-done', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, visitId }), signal: AbortSignal.timeout(6000) });
      const result: CommandResult = await response.json();
      setNotice(result); window.dispatchEvent(new Event('crisp-staff-change'));
    } catch { setNotice({ ok: false, message: 'Patient done confirmation unavailable. Review the room before retrying.' }); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div><button type="button" className="secondary" disabled={!visitId || !connected || busy} onClick={() => { void done(); }}>{busy ? 'Updating room…' : 'Patient done'}</button><StaffToast result={notice} /></div>;
}
