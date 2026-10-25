import { signalDisplayLabel } from './signals/index.ts';
import type { Observation } from '../../shared/types.ts';
import type { SignalReading } from './signals/index.ts';
import { normalizedBox, type FaceTrack } from './tracking.ts';

export function vitalLabel(reading: SignalReading): string {
  return signalDisplayLabel(reading);
}
export function makeObservation(track: FaceTrack, reading: SignalReading, options: { cam: string; source: Observation['source']; now: number; width: number; height: number }): Observation {
  const known = track.match !== null;
  return { cameraId: options.cam, trackId: track.id, at: options.now, visitId: track.match?.visitId ?? null, matchScore: track.match?.score ?? null,
    box: normalizedBox(track.face.box, options.width, options.height), source: options.source,
    hrBpm: known ? reading.hrBpm : null, hrQuality: known ? reading.hrQuality : 'none',
    rrBpm: known ? reading.rrBpm : null, rrQuality: known ? reading.rrQuality : 'none',
    posture: known ? reading.posture : null, hint: known ? reading.hint : null, pulseTrace: known ? reading.pulseTrace : null };
}
