import { useEffect, useRef, useState } from 'react';
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } }) => void) | null;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null;
  start(): void; abort(): void;
}
type Constructor = new () => Recognition;
function recognitionConstructor(): Constructor | undefined {
  if (typeof window === 'undefined') return;
  const browser = window as unknown as { SpeechRecognition?: Constructor; webkitSpeechRecognition?: Constructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
export function wakeCommand(text: string): string | null {
  const match = text.trim().match(/^hey[\s,]+(?:crisp|chris|crispy)\b[\s,.:;!?-]*(.*)$/i);
  return match ? match[1].trim() : null;
}
/** Never persisted: a new surface always starts with its microphone off. */
export function useWakeWord(enabled: boolean, onWake: (command: string) => void) {
  const [status, setStatus] = useState('Mic off');
  const stop = useRef<() => void>(() => {});
  const callback = useRef(onWake); callback.current = onWake;
  const available = Boolean(recognitionConstructor());
  useEffect(() => {
    const Constructor = recognitionConstructor();
    if (!enabled || !Constructor) { setStatus(Constructor ? 'Mic off' : 'Wake word unavailable — use Chrome or the talk button'); return; }
    const listener = new Constructor();
    listener.lang = 'en-US'; listener.continuous = true; listener.interimResults = false;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    stop.current = () => { stopped = true; clearTimeout(timer); listener.abort(); };
    function start() {
      if (stopped || document.hidden) return;
      try { setStatus('Starting microphone…'); listener.start(); }
      catch { stopped = true; setStatus('Could not start microphone — toggle off and retry'); }
    }
    listener.onstart = () => { if (!stopped) setStatus('Mic on · listening for Hey Crisp'); };
    listener.onresult = event => {
      if (stopped) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        const command = wakeCommand(event.results[i][0].transcript);
        if (command === null) continue;
        stopped = true; clearTimeout(timer); listener.abort(); setStatus('Wake heard · starting nurse voice');
        callback.current(command); break;
      }
    };
    listener.onerror = event => {
      if (stopped) return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)) stopped = true;
      setStatus(`Mic error: ${event.error}. Toggle off and retry, or use the talk button.`);
    };
    listener.onend = () => { if (!stopped) timer = setTimeout(start, 400); };
    const visibility = () => { if (document.hidden) listener.abort(); else if (!stopped) { clearTimeout(timer); start(); } };
    document.addEventListener('visibilitychange', visibility);
    start();
    return () => { stopped = true; clearTimeout(timer); listener.onresult = null; listener.onend = null; listener.onerror = null; listener.onstart = null; listener.abort(); document.removeEventListener('visibilitychange', visibility); };
  }, [enabled]);
  return { available, status, pause: () => stop.current() };
}
