import type { RenderTrack } from './overlay.ts';

export function debugReading({ track, reading }: RenderTrack): string {
  const posture = reading.posture;
  return `track: ${track.id} · visit: ${track.match?.visitId ?? 'unknown'} · source: ${track.source ?? 'face'}\n` +
    `referenceReady: ${reading.referenceReady ?? false} · slumpSec: ${(posture?.slumpSec ?? 0).toFixed(1)} · headDropSec: ${(posture?.headDropSec ?? 0).toFixed(1)}\n` +
    `fallSuspected: ${posture?.fallSuspected ?? false} · velocity: ${reading.velocity.toFixed(2)}`;
}
