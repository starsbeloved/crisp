import { useEffect, useState } from 'react';
import { createSourceClock } from '../runtime/clock.ts';
import { PhonePage } from './PhonePage.tsx';
import type { PatientCaptureProps, PhonePageProps } from './PhonePage.tsx';

/** Own one source/run per mounted route; StrictMode cleanup retires the old clock. */
export function PhoneRoute(props:PatientCaptureProps={}) {
  const [runtime, setRuntime] = useState<PhonePageProps | null>(null);
  useEffect(() => {
    const sourceId = crypto.randomUUID(), runId = crypto.randomUUID();
    const clock = createSourceClock({ sourceId, runId });
    let sequence = 0;
    setRuntime({ context: { sourceId, runId, getSyncId: clock.getSyncId, nextSeq: () => sequence++ }, synchronize: clock.synchronize, nowMs: clock.nowMs });
    return () => clock.dispose();
  }, []);
  return runtime ? <PhonePage {...runtime} {...props}/> : <main><h1>Phone pulse check</h1><p>Preparing secure capture controls. Camera has not started.</p></main>;
}
