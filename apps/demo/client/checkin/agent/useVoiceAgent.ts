import { useEffect, useRef, useState } from 'react';
import { useConversation, type ClientToolsConfig } from '@elevenlabs/react';
import type { CrispState } from '../../ui/Crisp.tsx';
import { stripCaptionTags } from './captions.ts';

export function useVoiceAgent(mode: 'checkin' | 'nurse', enabled: boolean, tools: ClientToolsConfig['clientTools'], context?: string) {
  const [available, setAvailable] = useState(false);
  const [captions, setCaptions] = useState<{ speaker: string; text: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [level, setLevel] = useState(0);
  const signed = useRef<string | null>(null);
  const currentTools = useRef(tools); currentTools.current = tools;
  const conversation = useConversation({
    onError: () => { setAvailable(false); signed.current = null; endSession(); },
    onMessage: message => setCaptions(items => [...items.slice(-11), { speaker: message.role === 'user' || message.source === 'user' ? 'You' : 'Crisp', text: stripCaptionTags(message.message) }]),
  });
  const { endSession, getOutputVolume, status, isSpeaking, sendContextualUpdate } = conversation;
  useEffect(() => {
    if (status === 'connected' && context) sendContextualUpdate(context);
  }, [status, context, sendContextualUpdate]);
  useEffect(() => {
    if (!enabled) { setAvailable(false); return; }
    const abort = new AbortController();
    void fetch(`/api/agent/signed-url?mode=${mode}`, { signal: abort.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!abort.signal.aborted && typeof data.signedUrl === 'string') { signed.current = data.signedUrl; setAvailable(true); }
    }).catch(() => { /* the form/text fallback stays visible */ });
    return () => abort.abort();
  }, [enabled, mode]);
  useEffect(() => () => endSession(), [endSession]);
  useEffect(() => {
    if (!isSpeaking) { setLevel(0); return; }
    const timer = setInterval(() => setLevel(Math.max(0, Math.min(1, getOutputVolume()))), 80);
    return () => clearInterval(timer);
  }, [isSpeaking, getOutputVolume]);
  async function start() {
    if (status !== 'disconnected') return;
    try {
      let url = signed.current;
      signed.current = null;
      if (!url) {
        const response = await fetch(`/api/agent/signed-url?mode=${mode}`, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error('Voice unavailable');
        url = (await response.json()).signedUrl;
      }
      if (typeof url !== 'string' || !url) throw new Error('Voice unavailable');
      setCaptions([]);
      const clientTools = Object.fromEntries(Object.keys(currentTools.current).map(name => [name, async (parameters: unknown) => {
        setThinking(true);
        try { return await currentTools.current[name](parameters); }
        finally { setThinking(false); }
      }]));
      await conversation.startSession({ signedUrl: url, connectionType: 'websocket', clientTools });
    } catch { setAvailable(false); endSession(); }
  }
  const mascotState: CrispState = thinking || status === 'connecting' ? 'thinking' : isSpeaking ? 'talking' : status === 'connected' ? 'listening' : 'idle';
  return { ...conversation, available, captions, level, mascotState, start };
}
