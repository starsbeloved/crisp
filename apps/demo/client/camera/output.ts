import type { Observation } from '../../shared/types.ts';
import type { SignalReading } from './signals/index.ts';
import { normalizedBox, type FaceTrack } from './tracking.ts';

export function vitalLabel(reading: SignalReading): string {
  const usable = (quality: string) => quality === 'good' || quality === 'fair';
  const hr = reading.hrBpm !== null && usable(reading.hrQuality) ? `${Math.round(reading.hrBpm)} bpm · ${reading.hrQuality}` :
    reading.hrQuality === 'low' ? 'low signal' : `measuring ${Math.floor(reading.hrSecondsCollected)}s`;
  const rr = reading.rrBpm !== null && usable(reading.rrQuality) ? `${Math.round(reading.rrBpm)}/min · ${reading.rrQuality}` :
    reading.rrQuality === 'low' ? 'low signal' : 'measuring…';
  return `♥ ${hr} · Breathing ${rr}`;
}
export function makeObservation(track: FaceTrack, reading: SignalReading, options: { cam: string; source: Observation['source']; now: number; width: number; height: number }): Observation {
  const known = track.match !== null;
  return { cameraId: options.cam, trackId: track.id, at: options.now, visitId: track.match?.visitId ?? null, matchScore: track.match?.score ?? null,
    box: normalizedBox(track.face.box, options.width, options.height), source: options.source,
    hrBpm: known ? reading.hrBpm : null, hrQuality: known ? reading.hrQuality : 'none',
    rrBpm: known ? reading.rrBpm : null, rrQuality: known ? reading.rrQuality : 'none',
    posture: known ? reading.posture : null, hint: known ? reading.hint : null, pulseTrace: known ? reading.pulseTrace : null };
}
