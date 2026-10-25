import { useEffect, useRef, useState } from 'react';
import type { Alert } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
export interface VoiceItem { key: string; id: string; url: string | null; speech: string; priority?: boolean; interrupt?: boolean; fallback?: boolean; expiresAt?: number }

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
      speakText('Monitoring sound is on.');
    }
    try { sessionStorage.setItem(soundKey, next ? 'on' : 'off'); } catch { /* Sound remains usable without storage. */ }
    setEnabled(next);
  }
  function speakText(text: string) {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.resume?.();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  return { enabled, toggle, test: () => speakText('Test alert sound. Crisp audio is working.') };
}

export function alertVoiceItems(alerts: Alert[], replayVisitIds: string[] = []): VoiceItem[] {
  return alerts.filter(alert => alert.status !== 'checked').flatMap(alert => {
    const cue = alert.facts.postureEvents.some(event => event.kind === 'fall') ? 'Fall-like movement detected. ' :
      alert.facts.postureEvents.some(event => event.kind === 'headDrop') ? 'Head below shoulders. ' : '';
    const speech = `${replayVisitIds.includes(alert.visitId) ? 'Replay. ' : ''}${cue}${alert.facts.name}, number ${alert.facts.queueNo}, may need a check.`;
    const browser = { key: `alert:${alert.id}:${alert.level}:browser`, id: alert.id, url: null, priority: true, interrupt: alert.level === 'red', speech };
    const provider = alert.level === 'red' && alert.audio === 'ready' ? [{ key: `alert:${alert.id}:${alert.level}:provider`, id: alert.id,
      url: api.alertAudioUrl(alert.id), speech: alert.explanation?.speech ?? speech, priority: true, fallback: false, expiresAt: alert.openedAt + 5000 }] : [];
    return [browser, ...provider];
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
  const current = items.find(i => i.key === currentKey.current);
  const item = items.find(i => i.interrupt && !seen.current.has(i.key)) ??
    (current?.priority ? current : items.find(i => i.priority && !seen.current.has(i.key)) ?? current ?? items.find(i => !seen.current.has(i.key)));
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
        if (item.expiresAt !== undefined && item.expiresAt <= Date.now()) { seen.current.add(item.key); currentKey.current = null; setTalkingId(null); return; }
        currentKey.current = item.key;
        seen.current.add(item.key); setTalkingId(item.id); setError('');
        if (item.url) {
          const played = await new Promise<boolean>(resolve => {
            let timeout: ReturnType<typeof setTimeout> | undefined;
            const finish = (result: boolean) => { clearTimeout(timeout); resolve(result); };
            finishCurrent = () => resolve(false);
            audio = new Audio(item.url!);
            audio.preload = 'auto';
            if (typeof audio.setAttribute === 'function') { audio.setAttribute('aria-hidden', 'true'); audio.style.display = 'none'; document.body?.appendChild(audio); }
            audio.onended = () => finish(true);
            audio.onerror = () => finish(false);
            timeout = setTimeout(() => finish(false), item.fallback === false ? 2500 : 5000);
            void audio.play().catch(() => finish(false));
          });
          if (!played && item.fallback !== false) await fallback(item);
        } else await fallback(item);
        if (!cancelled) { currentKey.current = null; setTalkingId(null); setCompletedKey(item.key); }
    }
    void run();
    return () => { cancelled = true; if (audio) { audio.pause(); audio.onended = null; audio.onerror = null; audio.parentNode?.removeChild(audio); } if (utterance) speechSynthesis.cancel(); finishCurrent?.(); setTalkingId(null); };
  }, [enabled, item?.key]);
  return { talkingId, error };
}
