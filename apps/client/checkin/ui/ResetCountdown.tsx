import { useEffect, useState } from 'react';

/** Mirrors the controller's existing ten-second reset; never resets the flow itself. */
export function ResetCountdown() {
  const [seconds, setSeconds] = useState(10);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.max(0, 10 - Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(timer);
  }, []);
  return <span className="checkin-countdown" aria-live="off">Starting over for the next person in {seconds} s</span>;
}
