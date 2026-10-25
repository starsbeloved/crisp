import type { CSSProperties } from 'react';
export function PulseWave({ trace, bpm }: { trace: number[] | null | undefined; bpm: number | null }) {
  const samples = trace?.filter(Number.isFinite) ?? [];
  return <span className="pulse-wave"><span aria-hidden="true" className={bpm ? 'pulse-heart beating' : 'pulse-heart'} style={{ '--beat': `${bpm && bpm > 0 ? 60 / bpm : 1}s` } as CSSProperties}>♥</span>
    {samples.length > 1 ? <svg viewBox="0 0 120 28" role="img" aria-label="Measured pulse waveform"><polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={samples.map((y, i) => `${i * 120 / (samples.length - 1)},${14 - Math.max(-1, Math.min(1, y)) * 11}`).join(' ')} /></svg> : <span className="wave-pending">Measuring pulse…</span>}
  </span>;
}
