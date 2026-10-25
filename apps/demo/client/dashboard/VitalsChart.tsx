import type { VitalsPoint } from '../../shared/types.ts';
const bands = { hr: [40, 50, 90, 110, 130], rr: [8, 11, 20, 24] };
function Plot({ history, kind, baseline }: { history: VitalsPoint[]; kind: 'hr' | 'rr'; baseline: number | null }) {
  const values = history.map(p => p[kind]).filter((n): n is number => n != null && Number.isFinite(n));
  const min = Math.min(kind === 'hr' ? 30 : 4, ...values, baseline ?? Infinity);
  const max = Math.max(kind === 'hr' ? 150 : 35, ...values, baseline ?? -Infinity);
  const y = (n: number) => 112 - (n - min) / (max - min) * 94;
  const start = history[0]?.t ?? 0, end = Math.max(start + 1000, history.at(-1)?.t ?? 0);
  const x = (t: number) => 38 + (t - start) / (end - start) * 408;
  const boundaries = [min, ...bands[kind], max];
  let path = '', connected = false;
  for (const p of history) { const n = p[kind]; if (n == null || !Number.isFinite(n)) { connected = false; continue; } path += `${connected ? 'L' : 'M'}${x(p.t)},${y(n)} `; connected = true; }
  return <div className="vitals-plot"><strong>{kind === 'hr' ? 'Heart rate · camera estimate · bpm' : 'Breathing · camera estimate · /min'}</strong>
    <svg viewBox="0 0 470 145" role="img" aria-label={`${kind === 'hr' ? 'Heart rate' : 'Breathing rate'} camera estimates with NEWS2 reference bands and dashed baseline`}>
      {boundaries.slice(0, -1).map((lo, i) => <rect key={i} x="38" y={y(boundaries[i + 1])} width="408" height={y(lo) - y(boundaries[i + 1])} fill={i === 2 ? 'var(--c-leaf-tint)' : i === 1 || i === 3 ? 'var(--c-amber-tint)' : 'var(--c-red-tint)'} />)}
      {bands[kind].map(n => <g key={n}><line x1="38" x2="446" y1={y(n)} y2={y(n)} stroke="var(--c-surface)" /><text x="30" y={y(n) + 4} textAnchor="end">{n}</text></g>)}
      {baseline != null && <g><line x1="38" x2="446" y1={y(baseline)} y2={y(baseline)} stroke="var(--c-text-2)" strokeDasharray="5 4" /><text x="440" y={y(baseline) - 4} textAnchor="end">Baseline {Math.round(baseline)}</text></g>}
      <path d={path} fill="none" stroke={kind === 'hr' ? 'var(--c-red-text)' : 'var(--c-leaf)'} strokeWidth="2" />
      {!values.length && <text x="242" y="70" textAnchor="middle">Measuring…</text>}
      <text x="38" y="136">{history.length ? new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</text>
      <text x="446" y="136" textAnchor="end">{history.length ? new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</text>
    </svg>
  </div>;
}
export function VitalsChart({ history, baselineHr, baselineRr, compact = false }: { history: VitalsPoint[]; baselineHr: number | null; baselineRr: number | null; compact?: boolean }) {
  return <div className="vitals-chart"><Plot history={history} kind="hr" baseline={baselineHr} />{!compact && <Plot history={history} kind="rr" baseline={baselineRr} />}
    <small>Shading: NEWS2 reference bands · dashed line: baseline · camera estimates</small>
  </div>;
}
