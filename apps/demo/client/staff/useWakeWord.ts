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
/** Chrome commonly transcribes Crisp as Chris; tolerate two character edits. */
export function matchWakePhrase(text: string): { phrase: string; command: string } | null {
  const match = text.trim().match(/^(hey|hi|okay)[\s,]*([a-z]+)\b[\s,.:;!?-]*(.*)$/i);
  if (!match) return null;
  const word = match[2].toLowerCase();
  let row = Array.from({ length: 6 }, (_, i) => i);
  for (let i = 0; i < word.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < 5; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(word[i] !== 'crisp'[j])));
    row = next;
  }
  return row[5] <= 2 ? { phrase: text.trim().slice(0, text.trim().length - match[3].length).replace(/[\s,.:;!?-]+$/, ''), command: match[3].trim() } : null;
}
export function wakeCommand(text: string): string | null { return matchWakePhrase(text)?.command ?? null; }
/** Never persisted: a new surface always starts with its microphone off. */
export function useWakeWord(enabled: boolean, onWake: (command: string) => void) {
  const [lastHeard, setLastHeard] = useState('');
  const [matchedPhrase, setMatchedPhrase] = useState('');
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('Mic off');
  const stop = useRef<() => void>(() => {});
  const callback = useRef(onWake); callback.current = onWake;
  const available = Boolean(recognitionConstructor());
  useEffect(() => {
    const Constructor = recognitionConstructor();
    setListening(false);
    if (!enabled || !Constructor) { setStatus(Constructor ? 'Mic off' : 'Wake word unavailable — use Chrome or the talk button'); return; }
    const listener = new Constructor();
    listener.lang = 'en-US'; listener.continuous = true; listener.interimResults = true;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    stop.current = () => { setListening(false); stopped = true; clearTimeout(timer); listener.abort(); };
    function start() {
      if (stopped || document.hidden) return;
      try { setStatus('Starting microphone…'); listener.start(); }
      catch { setStatus('Microphone restarting…'); timer = setTimeout(start, 400); }
    }
    listener.onstart = () => { if (!stopped) { setListening(true); setStatus('Mic on · listening for Hey Crisp'); } };
    listener.onresult = event => {
      if (stopped) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        setLastHeard(event.results[i][0].transcript);
        if (!event.results[i].isFinal) continue;
        const match = matchWakePhrase(event.results[i][0].transcript);
        if (!match) continue;
        setMatchedPhrase(match.phrase);
        stopped = true; setListening(false); clearTimeout(timer); listener.abort(); setStatus(`Wake heard: “${match.phrase}” · starting nurse voice`);
        callback.current(match.command); break;
      }
    };
    listener.onerror = event => {
      if (stopped) return;
      setListening(false);
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) stopped = true;
      setStatus(['not-allowed', 'service-not-allowed'].includes(event.error) ? `Microphone permission denied (${event.error}). Allow the microphone in Chrome’s site settings, then toggle listening off and on or use Talk to Crisp.` : `Mic error: ${event.error}. Toggle off and retry, or use Talk to Crisp.`);
    };
    listener.onend = () => { setListening(false); if (!stopped) timer = setTimeout(start, 400); };
    const visibility = () => { if (document.hidden) listener.abort(); else if (!stopped) { clearTimeout(timer); start(); } };
    document.addEventListener('visibilitychange', visibility);
    start();
    return () => { stopped = true; clearTimeout(timer); listener.onresult = null; listener.onend = null; listener.onerror = null; listener.onstart = null; listener.abort(); document.removeEventListener('visibilitychange', visibility); };
  }, [enabled]);
  return { available, status, lastHeard, matchedPhrase, listening, pause: () => stop.current() };
}
