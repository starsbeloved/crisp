import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { demoFixture } from '../../client/dashboard/fixture.ts';

const sdk = vi.hoisted(() => ({ generate: vi.fn(), config: {} as Record<string, string> }));
vi.mock('@google/genai', async original => ({ ...await original<typeof import('@google/genai')>(), GoogleGenAI: class {
  models = { generateContent: sdk.generate };
} }));
vi.mock('./config.ts', () => ({ providerConfig: () => sdk.config }));
const alert = demoFixture(1000).alerts[0];
const jpeg = new Uint8Array([255, 216, 255, 217]);
const unavailable = { description: 'Image description unavailable', source: 'template' };
beforeEach(() => {
  vi.resetModules(); sdk.generate.mockReset();
  sdk.config = { GEMINI_API_KEY: 'fake-test-key', GEMINI_MODEL: 'gemini-test-vision' };
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function describe() { return (await import('./index.ts')).describeSnapshot(alert, jpeg); }

it('sends only one inline JPEG and posture instructions, with no patient facts or SDK deadline', async () => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ description: 'A person is bent forward in a chair, head below the shoulders.' }) });
  expect(await describe()).toEqual({ description: 'A person is bent forward in a chair, head below the shoulders.', source: 'gemini' });
  const request = sdk.generate.mock.calls[0][0];
  expect(request.model).toBe('gemini-test-vision');
  expect(request.contents).toEqual([{ role: 'user', parts: [
    { text: expect.stringMatching(/visible posture/i) }, { inlineData: { mimeType: 'image/jpeg', data: '/9j/2Q==' } },
  ] }]);
  expect(request.config).toMatchObject({ responseMimeType: 'application/json', responseSchema: { required: ['description'] }, systemInstruction: expect.stringMatching(/unclear image/i) });
  expect(request.config.httpOptions).toBeUndefined();
  expect(JSON.stringify(request)).not.toContain('Ama');
  expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/^provider describeSnapshot ok \d+$/));
  expect(console.info).toHaveBeenCalledTimes(1);
});

it.each([
  'Ama is bent forward.', 'John is bent forward.', 'The person is named Sam.',
  'A woman is leaning forward.', 'He is sitting down.', 'An elderly Asian person is seated.',
  'A 40-year-old person is seated.', 'A person is having a heart attack.',
  'A person has a stroke.', 'A person needs emergency care.', 'A person appears unconscious.',
  'A person has sepsis.', 'A person needs urgent triage.', 'A person needs treatment.',
  Array(26).fill('posture').join(' '), '',
])('rejects identity, demographics, medical inferences and excessive length: %s', async description => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ description }) });
  expect(await describe()).toEqual(unavailable);
});

it('accepts uncertainty and the 25-word limit', async () => {
  sdk.generate.mockResolvedValueOnce({ text: JSON.stringify({ description: 'Unclear image' }) });
  expect(await describe()).toMatchObject({ description: 'Unclear image', source: 'gemini' });
  sdk.generate.mockResolvedValueOnce({ text: JSON.stringify({ description: Array(25).fill('seated').join(' ') }) });
  expect(await (await import('./index.ts')).describeSnapshot({ ...alert, id: 'boundary' }, jpeg)).toMatchObject({ source: 'gemini' });
});

it('returns no result without credentials or bytes, with no transport call', async () => {
  sdk.config = {};
  expect(await describe()).toBeNull();
  sdk.config = { GEMINI_API_KEY: 'fake-test-key' };
  expect(await (await import('./index.ts')).describeSnapshot(alert, new Uint8Array())).toBeNull();
  expect(sdk.generate).not.toHaveBeenCalled();
});

it('coalesces the same alert frame without retaining image bytes in its cache key', async () => {
  sdk.generate.mockResolvedValue({ text: '{"description":"A person is seated."}' });
  await Promise.all([describe(), describe()]);
  expect(sdk.generate).toHaveBeenCalledTimes(1);
});

it.each([{ status: 429 }, new Error('private transport details')])('falls back without retrying non-transient failure: %j', async error => {
  sdk.generate.mockRejectedValue(error);
  expect(await describe()).toEqual(unavailable);
  expect(sdk.generate).toHaveBeenCalledTimes(1);
});

it('retries a 503 once and accepts the second description', async () => {
  sdk.generate.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ text: '{"description":"A person is seated."}' });
  expect(await describe()).toMatchObject({ source: 'gemini' });
  expect(sdk.generate).toHaveBeenCalledTimes(2);
});

it('bounds each attempt to 2.5 seconds and aborts both hung transports', async () => {
  vi.useFakeTimers(); sdk.generate.mockImplementation(() => new Promise(() => {}));
  const work = describe();
  // Import before advancing the race timer.
  await import('./index.ts');
  await vi.advanceTimersByTimeAsync(2500);
  expect(sdk.generate).toHaveBeenCalledTimes(2);
  expect(sdk.generate.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await work).toEqual(unavailable);
  expect(sdk.generate.mock.calls[1][0].config.abortSignal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['not JSON', '{"description":42}', '{}'])('rejects malformed responses without retrying: %s', async text => {
  sdk.generate.mockResolvedValue({ text });
  expect(await describe()).toEqual(unavailable);
  expect(sdk.generate).toHaveBeenCalledTimes(1);
});
