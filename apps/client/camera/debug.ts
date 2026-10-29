import type { RenderTrack } from './overlay.ts';

export function debugReading({ track, reading }: RenderTrack): string {
  const posture = reading.posture;
  return `track: ${track.id} · visit: ${track.match?.visitId ?? 'unknown'} · source: ${track.source ?? 'face'}\n` +
    `referenceReady: ${reading.referenceReady ?? false} · slumpSec: ${(posture?.slumpSec ?? 0).toFixed(1)} · headDropSec: ${(posture?.headDropSec ?? 0).toFixed(1)}\n` +
    `fallSuspected: ${posture?.fallSuspected ?? false} · velocity: ${reading.velocity.toFixed(2)} shoulder-widths/s\n` +
    `faceVelocity: ${(reading.faceVelocity ?? 0).toFixed(2)} heights/s · trigger: ${reading.fallTrigger ?? 'none'}\n` +
    `faceBox: ${track.faceMissing || track.source === 'body' ? 'unavailable' : `${track.face.box.w.toFixed(0)}×${track.face.box.h.toFixed(0)} px (640-wide overlay)`}`;
}
