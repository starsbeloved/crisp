import { useEffect, useRef, useState } from 'react';
import type { NowCalling } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { hallwaySpeech } from './callout.ts';

/** Generation and media loading share one two-second deadline after sound is unlocked. */
export function useHallwayCallout(enabled: boolean, call: NowCalling | null, chime = false) {
  const heard = useRef(new Set<string>());
  const latest = useRef(call); latest.current = call;
  const ready = useRef<(() => void) | null>(null);
  const [talkingId, setTalkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled || !call || heard.current.has(call.id)) return;
    let active = true, started = false, spoken = false, chimeDone = !chime;
    let audio: HTMLAudioElement | null = null, bell: HTMLAudioElement | null = null;
    let utterance: SpeechSynthesisUtterance | null = null;
    let chimeTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(fallback, 2000);
    setError('');
    function finish() { if (active) setTalkingId(null); }
    function fallback() {
      if (!active || spoken) return;
      spoken = true; started = true; heard.current.add(call!.id);
      clearTimeout(deadline); clearTimeout(chimeTimer); audio?.pause(); bell?.pause();
      if (!('speechSynthesis' in window)) { setError('Voice unavailable. Read the on-screen message.'); finish(); return; }
      setTalkingId(call!.id);
      utterance = new SpeechSynthesisUtterance(hallwaySpeech(call!));
      utterance.onend = finish;
      utterance.onerror = () => { if (active) { setError('Voice unavailable. Read the on-screen message.'); finish(); } };
      speechSynthesis.speak(utterance);
    }
    function tryAudio() {
      if (!active || started || !chimeDone) return;
      const value = latest.current;
      if (value?.id !== call!.id) return;
      if (value.audio === 'failed') { fallback(); return; }
      if (value.audio !== 'ready' || audio) return;
      audio = new Audio(api.callAudioUrl(value.id));
      audio.onended = finish;
      audio.onerror = fallback;
      setTalkingId(value.id);
      void audio.play().then(() => {
        if (!active || spoken) { audio?.pause(); return; }
        started = true; heard.current.add(value.id); clearTimeout(deadline);
      }).catch(fallback);
    }
    ready.current = tryAudio;
    if (chime) {
      bell = new Audio('/sounds/lobby-chime.wav'); bell.volume = .3;
      const finishChime = () => { if (chimeDone || !active) return; chimeDone = true; clearTimeout(chimeTimer); bell?.pause(); tryAudio(); };
      bell.onended = finishChime; bell.onerror = finishChime;
      chimeTimer = setTimeout(finishChime, 300);
      void bell.play().catch(finishChime);
    } else tryAudio();
    return () => {
      active = false; ready.current = null; clearTimeout(deadline); clearTimeout(chimeTimer);
      for (const player of [audio, bell]) if (player) { player.pause(); player.onended = null; player.onerror = null; }
      if (utterance) { utterance.onend = null; utterance.onerror = null; speechSynthesis.cancel(); }
      setTalkingId(null);
    };
  }, [enabled, call?.id, chime]);
  useEffect(() => { ready.current?.(); }, [call?.id, call?.audio]);
  return { talkingId, error };
}
