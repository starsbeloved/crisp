import { useEffect, useRef } from 'react';
interface SessionState {
  connected: boolean; captions: { speaker: string; text: string }[];
  speaking: boolean; busy: boolean; completed: number; getInputVolume?: () => number;
}
/** End a completed staff exchange after a farewell or eight quiet seconds. */
export function useStaffSession({ connected, captions, speaking, busy, completed, getInputVolume }: SessionState, end: () => void) {
  const finish = useRef(end); finish.current = end;
  const inputVolume = useRef(getInputVolume); inputVolume.current = getInputVolume;
  const awaiting = useRef(false);
  const ended = useRef(false);
  const baseline = useRef(completed);
  useEffect(() => {
    if (!connected) { awaiting.current = false; ended.current = false; baseline.current = completed; return; }
    if (ended.current) return;
    const last = captions.at(-1);
    const text = last?.text.trim().toLowerCase().replace(/[’]/g, "'").replace(/[.!?,]+/g, '').replace(/\s+/g, ' ');
    const close = () => { if (!ended.current) { ended.current = true; finish.current(); } };
    if (last?.speaker === 'You' && /^(?:no(?: thanks| thank you)?|that's all(?: thanks| thank you)?|thanks|thank you|stop)$/.test(text ?? '')) { close(); return; }
    if (completed > baseline.current || (last?.speaker === 'Crisp' && /anything else/i.test(last.text))) awaiting.current = true;
    if (!awaiting.current || speaking || busy) return;
    let lastActivity = Date.now();
    const timer = setInterval(() => {
      // SDK input volume is normalized to 0–1. Do not cut off a spoken follow-up.
      if ((inputVolume.current?.() ?? 0) > 0.03) lastActivity = Date.now();
      if (Date.now() - lastActivity >= 8000) close();
    }, 200);
    return () => clearInterval(timer);
  }, [connected, captions, speaking, busy, completed]);
}
