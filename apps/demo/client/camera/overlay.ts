import type { RoomState } from '../../shared/types.ts';
import type { PoseSample, SignalReading } from './signals/index.ts';
import type { FaceTrack } from './tracking.ts';
import { cameraRequests, identityLabel, vitalLabel } from './output.ts';

export interface RenderTrack { track: FaceTrack; reading: SignalReading; pose: PoseSample['landmarks'] | null }
const bones = [[0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function postureLabel(reading: SignalReading): string {
  if (!reading.posture || !reading.referenceReady) return 'Learning posture…';
  if (reading.posture.headDropSec > 0) return `Head below shoulders · ${Math.round(reading.posture.headDropSec)} s`;
  if (reading.posture.slumpSec > 0) return `Slumped forward · ${Math.round(reading.posture.slumpSec)} s`;
  if (reading.posture.stillSec > 0) return `Still · ${Math.round(reading.posture.stillSec)} s`;
  return 'Upright';
}

function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: { fill: string; color: string; font?: string; pad?: number }) {
  const pad = options.pad ?? 9;
  ctx.font = options.font ?? '12px system-ui';
  const width = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = options.fill;
  ctx.beginPath(); ctx.roundRect(x, y, width, 24, 8); ctx.fill();
  ctx.fillStyle = options.color; ctx.fillText(text, x + pad, y + 16);
  return width;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, tracks: RenderTrack[], state: RoomState | null,
  options: { cam: string; replayName: string | null; fps: number; now: number; privacy: boolean; debug?: boolean; modelStatus?: string }) {
  const { width, height } = ctx.canvas;
  const red = token('--c-red', 'red'), amber = token('--c-amber-box', 'orange'), leaf = token('--c-leaf', 'green');
  const redText = token('--c-red-text', 'red'), amberText = token('--c-amber-text', 'orange');
  const text = token('--c-text', 'black'), surface = token('--c-surface', 'white'), muted = token('--c-text-2', 'gray');
  ctx.save();
  const requests = cameraRequests(state);
  for (const { track, reading, pose } of tracks) {
    const box = track.face.box;
    const request = track.match ? requests.find(alert => alert.visitId === track.match!.visitId) : undefined;
    const level = request?.level ?? (track.match ? state?.vitals[track.match.visitId]?.level : undefined);
    const color = !track.match ? muted : level === 'red' ? red : level === 'amber' ? amber : surface;
    const skeleton = !track.match ? surface : level === 'red' ? red : level === 'amber' ? amber : surface;
    if (options.privacy && !track.match) {
      ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
      ctx.filter = 'blur(18px)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore();
    }
    if (pose) {
      ctx.strokeStyle = skeleton; ctx.globalAlpha = track.match && level === 'none' ? .7 : .95; ctx.lineWidth = 4;
      for (const [a, b] of bones) {
        if (!pose[a] || !pose[b] || pose[a].visibility < 0.4 || pose[b].visibility < 0.4) continue;
        ctx.beginPath(); ctx.moveTo(pose[a].x * width, pose[a].y * height); ctx.lineTo(pose[b].x * width, pose[b].y * height); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = surface;
      for (const point of pose) if (point.visibility >= .4) { ctx.beginPath(); ctx.arc(point.x * width, point.y * height, 6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.lineWidth = !track.match ? 2 : level === 'red' ? 3 : 2.5; ctx.strokeStyle = color;
    if (!track.match) ctx.setLineDash([8, 6]);
    if (level === 'red') { ctx.shadowColor = red; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 14); ctx.stroke();
    ctx.shadowBlur = 0; ctx.setLineDash([]);

    const title = `${request ? 'Check requested · ' : ''}${identityLabel(track, state)}`;
    const subtitle = request ? request.reasons[0] ?? 'May need a check' : track.match ? vitalLabel(reading) : 'Camera estimates unavailable';
    ctx.font = '700 12px system-ui';
    const titleWidth = ctx.measureText(title).width + 18;
    const subtitleWidth = ctx.measureText(subtitle).width + 18;
    const bannerWidth = Math.min(width - 4, Math.max(titleWidth, subtitleWidth));
    const x = Math.max(2, Math.min(width - bannerWidth - 2, box.x));
    const y = Math.max(requests.length ? 76 : 48, box.y - 56);
    ctx.fillStyle = track.match ? level === 'red' ? red : level === 'amber' ? amber : 'rgba(20,20,22,.78)' : 'rgba(60,60,64,.86)';
    ctx.beginPath(); ctx.roundRect(x, y, bannerWidth, 46, 8); ctx.fill();
    ctx.fillStyle = surface; ctx.font = '700 12px system-ui'; ctx.fillText(title, x + 9, y + 17);
    ctx.font = '11px system-ui'; ctx.fillText(subtitle, x + 9, y + 35);

    if (track.match) {
      const traceY = Math.min(height - 46, box.y + box.h + 8), traceWidth = Math.max(118, Math.min(190, box.w * 1.8));
      ctx.fillStyle = 'rgba(20,20,22,.82)'; ctx.beginPath(); ctx.roundRect(box.x, traceY, traceWidth, 28, 8); ctx.fill();
      if (reading.pulseTrace && reading.pulseTrace.length > 1) {
        ctx.strokeStyle = level === 'red' ? red : level === 'amber' ? amber : surface; ctx.lineWidth = 1.8; ctx.beginPath();
        reading.pulseTrace.forEach((value, i, values) => {
          const px = box.x + 6 + i * 82 / (values.length - 1), py = traceY + 14 - Math.max(-1, Math.min(1, value)) * 9;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }); ctx.stroke();
      }
      ctx.fillStyle = surface; ctx.font = '11px system-ui'; ctx.fillText('camera estimate', box.x + 92, traceY + 17);
      const postureY = Math.min(height - 26, traceY + 34);
      const posture = postureLabel(reading);
      drawPill(ctx, posture, box.x, postureY, { fill: surface, color: level === 'red' ? redText : level === 'amber' ? amberText : text, font: '700 11px system-ui', pad: 8 });
      const beat = reading.hrBpm && reading.hrQuality !== 'low' ? Math.pow(Math.max(0, Math.cos(options.now / 1000 * reading.hrBpm / 60 * 2 * Math.PI)), 8) : 0;
      if (reading.hrBpm !== null && (reading.hrQuality === 'good' || reading.hrQuality === 'fair')) {
        ctx.fillStyle = red; ctx.font = `${14 + beat * 5}px system-ui`; ctx.fillText('♥', box.x + traceWidth + 6, traceY + 21);
      }
    }
    if (options.debug) {
      const posture = reading.posture;
      const lines = [`track: ${track.id} · visit: ${track.match?.visitId ?? 'unknown'}`,
        `source: ${track.source ?? 'face'} · referenceReady: ${reading.referenceReady ?? false}`,
        `slumpSec: ${(posture?.slumpSec ?? 0).toFixed(1)} · headDropSec: ${(posture?.headDropSec ?? 0).toFixed(1)}`,
        `fallSuspected: ${posture?.fallSuspected ?? false} · velocity: ${(reading.velocity ?? 0).toFixed(2)}`,
        `fps: ${options.fps.toFixed(1)} · ${options.modelStatus ?? 'Pose model: unknown'}`];
      ctx.font = '11px monospace';
      const debugWidth = Math.min(width - 8, Math.max(...lines.map(line => ctx.measureText(line).width)) + 12);
      const dx = Math.max(4, Math.min(width - debugWidth - 4, box.x));
      const dy = Math.max(76, Math.min(height - 98, box.y + box.h + 70));
      const debugHeight = lines.length * 15 + 8;
      ctx.fillStyle = 'rgba(0,0,0,.86)'; ctx.fillRect(dx, dy, debugWidth, debugHeight);
      ctx.fillStyle = '#fff'; lines.forEach((line, i) => ctx.fillText(line, dx + 6, dy + 14 + i * 15));
    }
  }
  ctx.fillStyle = options.replayName ? amber : 'rgba(20,20,22,.78)'; ctx.fillRect(0, 0, width, 38);
  ctx.fillStyle = surface; ctx.font = '700 13px system-ui';
  ctx.fillText(`${options.replayName ? `REPLAY · ${options.replayName}` : '● LIVE'} · Camera ${options.cam} · ${options.fps.toFixed(1)} fps`, 12, 24);
  if (requests.length) {
    ctx.fillStyle = red; ctx.fillRect(0, 38, width, 28); ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui';
    ctx.fillText(`Check requested · ${requests.map(alert => `${alert.facts.name} · #${alert.facts.queueNo}`).join(', ')} · may need a check`, 12, 57);
  }
  ctx.fillStyle = 'rgba(20,20,22,.86)'; ctx.fillRect(0, height - 30, width, 30); ctx.fillStyle = surface; ctx.font = '12px system-ui';
  ctx.fillText('Camera estimates · click a face to correct its identity', 12, height - 10);
  ctx.restore();
}
