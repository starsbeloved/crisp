import { signalDisplayLabel } from './signals/index.ts';
import type { Observation, RoomState } from '../../shared/types.ts';
import type { SignalReading } from './signals/index.ts';
import { normalizedBox, type FaceTrack } from './tracking.ts';

export function vitalLabel(reading: SignalReading): string {
  return signalDisplayLabel(reading);
}
export function identityLabel(track: FaceTrack, state: RoomState | null): string {
  if (!track.match) return track.identity === 'unknown' ? 'Unknown · not checked in' : 'Identifying…';
  const visit = state?.visits.find(visit => visit.id === track.match!.visitId);
  return `${track.match.name}${visit ? ` · #${visit.queueNo}` : ''} · ${track.source === 'body' ? 'body tracking' : `${Math.round(track.match.score * 100)}%`}`;
}
export function cameraRequests(state: RoomState | null) {
  return state?.alerts.filter(alert => alert.status !== 'checked' && state.visits.some(visit => visit.id === alert.visitId && visit.status === 'waiting')) ?? [];
}
export function makeObservation(track: FaceTrack, reading: SignalReading, options: { cam: string; source: Observation['source']; now: number; width: number; height: number }): Observation {
  const known = track.match !== null;
  const hasFace = known && track.source !== 'body';
  return { cameraId: options.cam, trackId: track.id, at: options.now, visitId: track.match?.visitId ?? null, matchScore: track.source === 'body' ? null : track.match?.score ?? null,
    box: normalizedBox(track.face.box, options.width, options.height), source: options.source,
    hrBpm: hasFace ? reading.hrBpm : null, hrQuality: !known ? 'none' : hasFace ? reading.hrQuality : 'low',
    rrBpm: known ? reading.rrBpm : null, rrQuality: known ? reading.rrQuality : 'none',
    posture: known ? reading.posture : null, hint: known ? reading.hint : null, pulseTrace: hasFace ? reading.pulseTrace : null };
}
