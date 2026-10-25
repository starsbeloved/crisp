import type { Alert, Observation, RoomState, Vitals } from '../../shared/types.ts';

export interface EngineResult { opened: Alert[]; updated: Alert[] }

export function ingest(state: RoomState, observations: Observation[], now: number): EngineResult {
  for (const obs of observations) {
    if (!obs.visitId || !state.visits.some(visit => visit.id === obs.visitId && visit.status === 'waiting')) continue;
    const previous = state.vitals[obs.visitId];
    const point = { t: obs.at || now, hr: obs.hrBpm, rr: obs.rrBpm };
    const history = [...(previous?.history ?? []), point].filter(item => item.t >= now - 600_000).slice(-600);
    const vitals: Vitals = {
      visitId: obs.visitId, lastSeenAt: obs.at || now, cameraId: obs.cameraId, box: obs.box,
      hrBpm: obs.hrBpm, hrQuality: obs.hrQuality, rrBpm: obs.rrBpm, rrQuality: obs.rrQuality,
      baselineHr: previous?.baselineHr ?? null, baselineRr: previous?.baselineRr ?? null,
      posture: obs.posture, hint: obs.hint, source: obs.source, pulseTrace: obs.pulseTrace,
      level: previous?.level ?? 'none', history,
    };
    state.vitals[obs.visitId] = vitals;
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
