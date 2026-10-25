import { useEffect, useRef, useState } from 'react';
import type { Alert } from '../../shared/types.ts';
export interface VoiceItem { key: string; id: string; url: string | null; speech: string }

const soundKey = 'crisp-monitoring-sound';
/** sessionStorage remembers the explicit sound gesture within this tab. */
export function useMonitoringSound() {
  const [enabled, setEnabled] = useState(() => {
    try { return sessionStorage.getItem(soundKey) === 'on'; } catch { return false; }
  });
  function toggle() {
    const next = !enabled;
    if (next && typeof speechSynthesis !== 'undefined') {
      speechSynthesis.resume?.();
      const confirmation = new SpeechSynthesisUtterance('Monitoring sound is on.');
      speechSynthesis.speak(confirmation);
    }
    try { sessionStorage.setItem(soundKey, next ? 'on' : 'off'); } catch { /* Sound remains usable without storage. */ }
    setEnabled(next);
  }
  return { enabled, toggle };
}

export function alertVoiceItems(alerts: Alert[], replayVisitIds: string[] = []): VoiceItem[] {
  return alerts.filter(alert => alert.status !== 'checked').map(alert => {
    const cue = alert.facts.postureEvents.some(event => event.kind === 'fall') ? 'Fall-like movement detected. ' :
      alert.facts.postureEvents.some(event => event.kind === 'headDrop') ? 'Head below shoulders. ' : '';
    return { key: `alert:${alert.id}:${alert.level}`, id: alert.id, url: null,
      speech: `${replayVisitIds.includes(alert.visitId) ? 'Replay. ' : ''}${cue}${alert.facts.name}, number ${alert.facts.queueNo}, may need a check.` };
  });
}

/** Announce the observed request immediately. Provider/SSE updates keep the same key. */
export function useAlertVoice(enabled: boolean, alerts: Alert[], extraItems: VoiceItem[] = [], replayVisitIds: string[] = []) {
  return useVoice(enabled, [...alertVoiceItems(alerts, replayVisitIds), ...extraItems]);
}

/** One audio queue per surface. Mark attempted items before playback to survive SSE refreshes. */
export function useVoice(enabled: boolean, items: VoiceItem[]) {
  const seen = useRef(new Set<string>());
  const [talkingId, setTalkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, setCompletedKey] = useState<string | null>(null);
  const currentKey = useRef<string | null>(null);
  const item = items.find(i => i.key === currentKey.current) ?? items.find(i => !seen.current.has(i.key));
  useEffect(() => {
    if (!enabled || !item) { currentKey.current = null; setTalkingId(null); return; }
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
        if (!item) return;
        currentKey.current = item.key;
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
        if (!cancelled) { currentKey.current = null; setTalkingId(null); setCompletedKey(item.key); }
    }
    void run();
    return () => { cancelled = true; if (audio) { audio.pause(); audio.onended = null; audio.onerror = null; } if (utterance) speechSynthesis.cancel(); finishCurrent?.(); setTalkingId(null); };
  }, [enabled, item?.key]);
  return { talkingId, error };
}
