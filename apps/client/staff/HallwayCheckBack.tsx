import { useEffect, useState } from 'react';
/** Public-safe extension point for the room-view integrator. Never shows complaints, vitals or full names. */
export function HallwayCheckBack() {
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try { const response = await fetch('/api/hallway/check-back', { signal: AbortSignal.timeout(4000) }); if (!response.ok) throw new Error(); const data = await response.json(); if (!stopped && Array.isArray(data.messages)) setMessages(data.messages); }
      catch { if (!stopped) setMessages([]); }
    }
    void refresh(); const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  return <div aria-live="polite">{messages.map(message => <p key={message.id}>{message.text}</p>)}</div>;
}
