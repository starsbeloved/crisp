import type { RoomState } from '../../shared/types.ts';
import type { PoseSample, SignalReading } from './signals/index.ts';
import type { FaceTrack } from './tracking.ts';
import { vitalLabel } from './output.ts';

export interface RenderTrack { track: FaceTrack; reading: SignalReading; pose: PoseSample['landmarks'] | null }
const bones = [[0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

export function drawOverlay(ctx: CanvasRenderingContext2D, tracks: RenderTrack[], state: RoomState | null,
  options: { cam: string; replayName: string | null; fps: number; now: number; privacy: boolean }) {
  const { width, height } = ctx.canvas;
  ctx.save();
  for (const { track, reading, pose } of tracks) {
    const box = track.face.box;
    const level = track.match ? state?.vitals[track.match.visitId]?.level : undefined;
    const color = !track.match ? '#747b83' : level === 'red' ? '#d93a3a' : level === 'amber' ? '#c77700' : '#246b45';
    if (options.privacy && !track.match) {
      ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
      ctx.filter = 'blur(18px)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore();
    }
    ctx.lineWidth = 2; ctx.strokeStyle = color;
    if (pose) for (const [a, b] of bones) {
      if (!pose[a] || !pose[b] || pose[a].visibility < 0.4 || pose[b].visibility < 0.4) continue;
      ctx.beginPath(); ctx.moveTo(pose[a].x * width, pose[a].y * height); ctx.lineTo(pose[b].x * width, pose[b].y * height); ctx.stroke();
    }
    ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 8); ctx.stroke();
    const title = track.match ? `${track.match.name} · ${Math.round(track.match.score * 100)}% match` : track.identity === 'unknown' ? 'Unknown' : 'Identifying…';
    const subtitle = track.match ? vitalLabel(reading) : 'Camera estimates unavailable';
    ctx.font = 'bold 15px system-ui';
    const bannerWidth = Math.min(width, Math.max(ctx.measureText(title).width, ctx.measureText(subtitle).width) + 20);
    const x = Math.max(0, Math.min(width - bannerWidth, box.x)), y = Math.max(44, box.y - 52);
    ctx.fillStyle = color; ctx.fillRect(x, y, bannerWidth, 48);
    ctx.fillStyle = '#fff'; ctx.fillText(title, x + 8, y + 18); ctx.font = '12px system-ui'; ctx.fillText(subtitle, x + 8, y + 37);
    const traceY = Math.min(height - 48, box.y + box.h + 6), traceWidth = Math.max(80, box.w);
    ctx.fillStyle = '#101d21dc'; ctx.fillRect(box.x, traceY, traceWidth, 32);
    if (track.match && reading.pulseTrace && reading.pulseTrace.length > 1) {
      ctx.strokeStyle = '#8cf1b0'; ctx.lineWidth = 1.5; ctx.beginPath();
      reading.pulseTrace.forEach((value, i, values) => {
        const px = box.x + i * traceWidth / (values.length - 1), py = traceY + 16 - Math.max(-1, Math.min(1, value)) * 12;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }); ctx.stroke();
    }
    if (track.match && reading.hrBpm !== null && (reading.hrQuality === 'good' || reading.hrQuality === 'fair')) {
      const beat = Math.pow(Math.max(0, Math.cos(options.now / 1000 * reading.hrBpm / 60 * 2 * Math.PI)), 8);
      ctx.fillStyle = '#ff6475'; ctx.font = `${14 + beat * 7}px system-ui`; ctx.fillText('♥', box.x + traceWidth + 4, traceY + 24);
    }
    if (reading.hint && track.match) { ctx.font = '13px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(reading.hint, box.x + 5, traceY + 47); }
  }
  ctx.fillStyle = options.replayName ? '#9d4800' : '#173e2a'; ctx.fillRect(0, 0, width, 36);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui';
  ctx.fillText(`${options.replayName ? `REPLAY: ${options.replayName}` : '● LIVE'} · Camera ${options.cam} · ${options.fps.toFixed(1)} fps`, 10, 24);
  ctx.fillStyle = '#12181ee8'; ctx.fillRect(0, height - 26, width, 26); ctx.fillStyle = '#fff'; ctx.font = '12px system-ui';
  ctx.fillText('Camera estimates · Click a face to correct its identity', 10, height - 9);
  ctx.restore();
}
