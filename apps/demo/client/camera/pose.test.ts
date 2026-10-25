import { describe, expect, it, vi } from 'vitest';

const { createFromOptions } = vi.hoisted(() => ({ createFromOptions: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({ wasm: true })) },
  PoseLandmarker: { createFromOptions },
}));

import { loadPoseModel } from './pose.ts';

describe('pose model loading', () => {
  it('tries the GPU delegate first and falls back to CPU when GPU creation fails', async () => {
    const model = { close: vi.fn() };
    createFromOptions.mockReset().mockRejectedValueOnce(new Error('GPU unavailable')).mockResolvedValueOnce(model);

    await expect(loadPoseModel()).resolves.toMatchObject({ model, delegate: 'CPU' });
    expect(createFromOptions).toHaveBeenNthCalledWith(1, { wasm: true }, expect.objectContaining({
      baseOptions: expect.objectContaining({ delegate: 'GPU' }),
    }));
    expect(createFromOptions).toHaveBeenNthCalledWith(2, { wasm: true }, expect.objectContaining({
      baseOptions: expect.objectContaining({ delegate: 'CPU' }),
    }));
  });

  it('reports both delegate errors when neither pose delegate can load', async () => {
    createFromOptions.mockReset().mockRejectedValueOnce(new Error('GPU unavailable')).mockRejectedValueOnce(new Error('CPU unavailable'));
    await expect(loadPoseModel()).rejects.toThrow('GPU: GPU unavailable; CPU: CPU unavailable');
  });
});
