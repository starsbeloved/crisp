import { useEffect, useRef, useState } from 'react';
import { parseExamCommand, type ExamCommand } from './model.ts';

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null;
  start(): void; abort(): void;
};
function recognitionConstructor(): (new () => Recognition) | undefined {
  const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
/** Local retrieval commands keep allergy read-back verbatim. No clinical Q&A is generated here. */
export function useDoctorVoice(enabled: boolean, onCommand: (command: ExamCommand) => void) {
  const [status, setStatus] = useState('Voice off');
  const command = useRef(onCommand); command.current = onCommand;
  const recognition = useRef<Recognition | null>(null);
  const speaking = useRef(false);
  const available = Boolean(recognitionConstructor());
  useEffect(() => {
    const Constructor = recognitionConstructor();
    if (!enabled || !Constructor) { setStatus(Constructor ? 'Voice off' : 'Voice commands unavailable in this browser'); return; }
    const listener = new Constructor(); recognition.current = listener;
    listener.lang = 'en-US'; listener.continuous = true; listener.interimResults = false;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => { if (stopped || speaking.current) return; try { listener.start(); setStatus('Mic on · listening for Hey Crisp'); } catch { setStatus('Voice could not start — turn listening off and on to retry'); } };
    listener.onresult = event => {
      if (speaking.current) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        const result = parseExamCommand(event.results[i][0].transcript);
        if (result) command.current(result);
      }
    };
    listener.onend = () => { if (!stopped) timer = setTimeout(start, 400); };
    listener.onerror = event => { setStatus(`Microphone: ${event.error}`); if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') stopped = true; };
    start();
    return () => {
      stopped = true; clearTimeout(timer); listener.onend = null; listener.onresult = null; listener.onerror = null;
      listener.abort(); recognition.current = null;
      if (speaking.current) window.speechSynthesis?.cancel();
      speaking.current = false;
    };
  }, [enabled]);
  useEffect(() => () => { if (speaking.current) window.speechSynthesis?.cancel(); }, []);
  function speak(text: string) {
    if (!enabled || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US';
    speaking.current = true; recognition.current?.abort();
    const finish = () => { speaking.current = false; try { recognition.current?.start(); } catch { /* onend also restarts the listener */ } };
    utterance.onend = finish; utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }
  return { available, status, speak };
}
