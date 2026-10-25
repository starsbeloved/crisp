import { describe, expect, it } from 'vitest';
import { RoomStore } from './store.ts';

describe('RoomStore camera snapshots', () => {
  it('drops cameras whose last frame is at least five minutes old', () => {
    const store = new RoomStore(null);
    const now = Date.now();
    store.state.cameras = {
      fresh: { cameraId: 'fresh', lastFrameAt: now - 299_999, source: 'live', fps: 12, visible: true },
      old: { cameraId: 'old', lastFrameAt: now - 300_001, source: 'live', fps: 12, visible: true },
    };

    expect(Object.keys(store.snapshot().cameras)).toEqual(['fresh']);
    expect(store.state.cameras.old).toBeUndefined();
  });
});
