import { useEffect, useRef, useState } from 'react';
export interface VoiceItem { key: string; id: string; url: string | null; speech: string }

/** One audio queue per surface. Mark attempted items before playback to survive SSE refreshes. */
export function useVoice(enabled: boolean, items: VoiceItem[]) {
  const seen = useRef(new Set<string>());
  const [talkingId, setTalkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const signature = items.map(i => i.key).join('|');
  const latest = useRef(items); latest.current = items;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, audio: HTMLAudioElement | null = null, utterance: SpeechSynthesisUtterance | null = null;
    let finishCurrent: (() => void) | null = null;
    async function fallback(item: VoiceItem) {
      if (cancelled) return;
      if (!('speechSynthesis' in window)) { setError('Voice unavailable. Read the on-screen message.'); return; }
      await new Promise<void>(resolve => {
        finishCurrent = resolve;
        utterance = new SpeechSynthesisUtterance(item.speech);
        utterance.onend = () => resolve();
        utterance.onerror = () => { if (!cancelled) setError('Voice unavailable. Read the on-screen message.'); resolve(); };
        speechSynthesis.speak(utterance);
      });
    }
    async function run() {
      for (const item of latest.current) {
        if (cancelled || seen.current.has(item.key)) continue;
        seen.current.add(item.key); setTalkingId(item.id); setError('');
        if (item.url) {
          const played = await new Promise<boolean>(resolve => {
            finishCurrent = () => resolve(false);
            audio = new Audio(item.url!);
            audio.onended = () => resolve(true);
            audio.onerror = () => resolve(false);
            void audio.play().catch(() => resolve(false));
          });
          if (!played) await fallback(item);
        } else await fallback(item);
        if (!cancelled) setTalkingId(null);
      }
    }
    void run();
    return () => { cancelled = true; if (audio) { audio.pause(); audio.onended = null; audio.onerror = null; } if (utterance) speechSynthesis.cancel(); finishCurrent?.(); setTalkingId(null); };
  }, [enabled, signature]);
  return { talkingId, error };
}
