import { useEffect, useState } from 'react';

/** Hidden camera tabs release resources; returning to the tab reopens them. */
export function usePageActive() {
  const [active, setActive] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const visibility = () => setActive(document.visibilityState !== 'hidden');
    const hide = () => setActive(false);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
    };
  }, []);
  return active;
}
