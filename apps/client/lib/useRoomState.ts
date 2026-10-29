import { useEffect, useState } from 'react';
import type { RoomState } from '../../shared/types.ts';
export function useRoomState() {
  const [state, setState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const events = new EventSource('/api/events');
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.addEventListener('state', event => { setState(JSON.parse((event as MessageEvent).data)); setConnected(true); });
    return () => events.close();
  }, []);
  return { state, connected };
}
