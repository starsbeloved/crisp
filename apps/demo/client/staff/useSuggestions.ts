import { useEffect, useState } from 'react';
import type { SuggestionState } from '../../server/proactive.ts';
const empty: SuggestionState = { suggestions: [], dispositions: {} };
export function useSuggestions(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<SuggestionState>(empty);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSnapshot(empty); setReady(false);
    if (!enabled) return;
    let stopped = false, busy = false;
    let abort: AbortController | undefined;
    async function refresh() {
      if (busy || stopped) return;
      busy = true; abort = new AbortController();
      const timeout = setTimeout(() => abort?.abort(), 4000);
      try {
        const response = await fetch('/api/suggestions', { signal: abort.signal });
        if (!response.ok) throw new Error();
        const value: SuggestionState = await response.json();
        if (!Array.isArray(value.suggestions) || !value.dispositions) throw new Error();
        if (!stopped) { setSnapshot(value); setReady(true); }
      } catch { if (!stopped) setReady(false); }
      finally { busy = false; clearTimeout(timeout); }
    }
    void refresh(); const timer = setInterval(() => { void refresh(); }, 5000);
    const changed = () => { void refresh(); }; window.addEventListener('crisp-staff-change', changed);
    return () => { stopped = true; clearInterval(timer); abort?.abort(); window.removeEventListener('crisp-staff-change', changed); };
  }, [enabled]);
  return { snapshot, ready: ready && enabled };
}
