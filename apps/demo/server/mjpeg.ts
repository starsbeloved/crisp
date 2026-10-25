import type { ServerResponse } from 'node:http';

type Frame = { at: number; bytes: Uint8Array };

export class MjpegBuffer {
  private latest = new Map<string, Frame>();
  private history = new Map<string, Frame[]>();
  private viewers = new Map<string, Set<ServerResponse>>();
  private replays = new Map<string, Frame[]>();

  push(cameraId: string, bytes: Uint8Array, at = Date.now()): void {
    const frame = { at, bytes };
    this.latest.set(cameraId, frame);
    const frames = (this.history.get(cameraId) ?? []).filter(item => item.at >= at - 30_000);
    // Keep at most five frames per second for replay storage.
    if (!frames.length || at - frames[frames.length - 1].at >= 200) frames.push(frame);
    this.history.set(cameraId, frames.slice(-150));
    for (const viewer of this.viewers.get(cameraId) ?? []) this.writePart(viewer, frame);
  }

  stream(cameraId: string, response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache', Connection: 'keep-alive',
    });
    response.flushHeaders();
    let viewers = this.viewers.get(cameraId);
    if (!viewers) { viewers = new Set(); this.viewers.set(cameraId, viewers); }
    viewers.add(response);
    const frame = this.latest.get(cameraId);
    if (frame) this.writePart(response, frame);
    response.on('close', () => viewers!.delete(response));
  }

  capture(alertId: string, cameraId: string | null, at = Date.now()): number {
    const frames = cameraId ? (this.history.get(cameraId) ?? []).filter(frame => frame.at >= at - 15_000) : [];
    this.replays.set(alertId, [...frames]);
    return frames.length;
  }

  replay(alertId: string, index: number): Uint8Array | null {
    return this.replays.get(alertId)?.[index]?.bytes ?? null;
  }

  reset(): void {
    this.latest.clear(); this.history.clear(); this.replays.clear();
  }

  private writePart(response: ServerResponse, frame: Frame): void {
    response.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.bytes.length}\r\n\r\n`);
    response.write(frame.bytes);
    response.write('\r\n');
  }
}
