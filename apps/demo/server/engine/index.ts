import type { Alert, Observation, RoomState, Vitals } from '../../shared/types.ts';

export interface EngineResult { opened: Alert[]; updated: Alert[] }

// Local adapter: keep samples beside the vitals in the existing room store. This
// also survives RoomStore persistence without changing the frozen shared types.
interface EngineMemory {
  firstSeenAt: number;
  hrSamples: number[]; rrSamples: number[];
  hrSampleAt: number | null; rrSampleAt: number | null;
}
type EngineVitals = Vitals & { _engine?: EngineMemory };
const qualityRank = { none: 0, low: 1, fair: 2, good: 3 };

function memory(vitals: EngineVitals, now: number): EngineMemory {
  return vitals._engine ??= { firstSeenAt: now, hrSamples: [], rrSamples: [], hrSampleAt: null, rrSampleAt: null };
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function collectBaseline(vitals: EngineVitals, now: number): void {
  const data = memory(vitals, now);
  for (const signal of ['hr', 'rr'] as const) {
    const samples = signal === 'hr' ? data.hrSamples : data.rrSamples;
    const value = signal === 'hr' ? vitals.hrBpm : vitals.rrBpm;
    const quality = signal === 'hr' ? vitals.hrQuality : vitals.rrQuality;
    const sampleAt = signal === 'hr' ? data.hrSampleAt : data.rrSampleAt;
    if (quality !== 'good' || value === null || !Number.isFinite(value) ||
      (sampleAt !== null && now - sampleAt < 1000) ||
      (now - data.firstSeenAt > 60_000 && samples.length >= 10)) continue;
    samples.push(value);
    if (signal === 'hr') {
      data.hrSampleAt = now;
      if (samples.length >= 10) vitals.baselineHr = median(samples);
    } else {
      data.rrSampleAt = now;
      if (samples.length >= 10) vitals.baselineRr = median(samples);
    }
  }
}

export function ingest(state: RoomState, observations: Observation[], now: number): EngineResult {
  const selected = new Map<string, Observation>();
  for (const obs of observations) {
    if (!obs.visitId || !state.visits.some(visit => visit.id === obs.visitId && visit.status === 'waiting')) continue;
    const best = selected.get(obs.visitId);
    if (!best || qualityRank[obs.hrQuality] > qualityRank[best.hrQuality] ||
      (obs.hrQuality === best.hrQuality && obs.at > best.at)) selected.set(obs.visitId, obs);
  }
  for (const [visitId, obs] of selected) {
    const previous = state.vitals[visitId] as EngineVitals | undefined;
    const history = (previous?.history ?? []).filter(item => item.t >= now - 600_000);
    if (!history.length || now - history[history.length - 1].t >= 1000) {
      history.push({ t: now, hr: obs.hrBpm, rr: obs.rrBpm });
    }
    const vitals: EngineVitals = {
      visitId, lastSeenAt: obs.at, cameraId: obs.cameraId, box: obs.box,
      hrBpm: obs.hrBpm, hrQuality: obs.hrQuality, rrBpm: obs.rrBpm, rrQuality: obs.rrQuality,
      baselineHr: previous?.baselineHr ?? null, baselineRr: previous?.baselineRr ?? null,
      posture: obs.posture, hint: obs.hint, source: obs.source, pulseTrace: obs.pulseTrace,
      level: 'none', history, _engine: previous?._engine,
    };
    collectBaseline(vitals, now);
    state.vitals[visitId] = vitals;
  }
  return { opened: [], updated: [] };
}

export function onChecked(state: RoomState, alert: Alert, _now: number): void {
  const vitals = state.vitals[alert.visitId];
  if (vitals) {
    vitals.baselineHr = null;
    vitals.baselineRr = null;
    vitals.level = 'none';
  }
}
